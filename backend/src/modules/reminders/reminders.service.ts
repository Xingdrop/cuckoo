import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Between, DataSource, Repository } from 'typeorm';
import {
  computeFollowingTrigger,
  computeNextTrigger,
  localToUtc,
  toLocal,
} from '../../common/reminder-schedule';
import { Medicine } from '../medicines/medicine.entity';
import { AuditService } from '../audit/audit.service';
import { PlansService } from '../plans/plans.service';
import { Plan } from '../plans/plan.entity';
import { AchievementsService } from '../achievements/achievements.service';
import { Notification, NotificationType } from '../notifications/notification.entity';
import { User } from '../users/user.entity';
import { UserSetting } from '../users/user-setting.entity';
import { AckReminderDto } from './dto/ack-reminder.dto';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { ReminderLog, ReminderLogStatus } from './reminder-log.entity';
import {
  IntervalUnit,
  Reminder,
  ReminderCategory,
  ReminderContent,
  RepeatType,
} from './reminder.entity';

const DEFAULT_TZ = 'Asia/Shanghai';

/** 月的最后一天（dayOfMonth > 28 时顺延） */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 绝对时间 → 用户时区 HH:mm */
function toLocalTimeStr(d: Date | string, timezone: string): string {
  const l = toLocal(d, timezone);
  return `${String(l.hour).padStart(2, '0')}:${String(l.minute).padStart(2, '0')}`;
}

@Injectable()
export class RemindersService {
  constructor(
    @InjectRepository(Reminder)
    private readonly reminderRepo: Repository<Reminder>,
    @InjectRepository(ReminderLog)
    private readonly logRepo: Repository<ReminderLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly settingRepo: Repository<UserSetting>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly plans: PlansService,
    @Inject(forwardRef(() => AchievementsService))
    private readonly achievements: AchievementsService,
  ) {}

  private async getUserTimezone(userId: string): Promise<string> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return user?.timezone ?? DEFAULT_TZ;
  }

  /** 供统计模块读取用户时区 */
  async getUserTimezoneSafe(userId: string): Promise<string> {
    return this.getUserTimezone(userId);
  }

  /** 创建提醒：计算首次 nextTriggerAt（调度引擎依赖） */
  async create(userId: string, dto: CreateReminderDto) {
    const timezone = await this.getUserTimezone(userId);
    // 喝水目标同步到用户设置
    if (dto.waterGoalMl) {
      await this.settingRepo.update({ userId }, { waterGoalMl: dto.waterGoalMl });
    }
    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : null;

    const reminder = this.reminderRepo.create({
      id: randomUUID(),
      userId,
      category: dto.category,
      categoryLabel: dto.categoryLabel ?? null,
      categoryIcon: dto.categoryIcon ?? null,
      title: dto.title,
      repeatRule: dto.repeatRule,
      startDate,
      endDate,
      content: dto.content ?? {},
      method: dto.method ?? {},
      delaySettings: dto.delaySettings ?? {},
      challenge: dto.challenge ?? {},
      medicineId: dto.medicineId ?? null,
      planId: dto.planId ?? null,
      isActive: dto.isActive ?? true,
      countInRate: dto.countInRate !== false,
      times: dto.times ?? null,
      nextTriggerAt: computeNextTrigger(
        dto.repeatRule,
        new Date(),
        startDate,
        endDate,
        timezone,
        dto.times ?? null,
      ),
    });
    return this.reminderRepo.save(reminder);
  }

  /** 列表：支持分类/启停筛选；排序默认 nextTriggerAt 升序 */
  async list(userId: string, query: { category?: string; isActive?: boolean } = {}) {
    const qb = this.reminderRepo
      .createQueryBuilder('r')
      .where('r.userId = :userId', { userId })
      .orderBy('r.nextTriggerAt', 'ASC');
    if (query.category) qb.andWhere('r.category = :category', { category: query.category });
    if (query.isActive !== undefined) qb.andWhere('r.isActive = :isActive', { isActive: query.isActive });
    const items = await qb.getMany();
    // 附上计划名（展示"来自 xx 计划"；停用计划仅标记，不影响列表）
    const plans = await this.plans.nameMap(items.map((r) => r.planId ?? ''));
    return items.map((r) => ({
      ...r,
      planName: r.planId ? (plans.get(r.planId) ?? null) : null,
    }));
  }

  /**
   * 指定日期的规划视图（日历/日期切换）：
   * 对每个活动提醒计算该日期（用户时区）应触发的时间点 + 完成状态。
   * date 格式 YYYY-MM-DD（用户本地日期）。
   */
  async dayPlan(userId: string, dateStr: string) {
    const timezone = await this.getUserTimezone(userId);
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '日期格式须为 YYYY-MM-DD' });
    }
    const dayStart = localToUtc(timezone, y, m, d, 0, 0);
    const nextDayStart = localToUtc(timezone, y, m, d + 1, 0, 0);
    const dayLocal = toLocal(dayStart, timezone);

    const reminders = await this.reminderRepo.find({
      where: { userId, isActive: true },
    });
    const logs = await this.logRepo.find({
      where: { userId, scheduledTime: Between(dayStart, nextDayStart) },
      order: { scheduledTime: 'ASC' },
    });

    const result: {
      reminderId: string;
      nextTriggerAt: Date | null;
      title: string;
      category: ReminderCategory;
      categoryLabel: string | null;
      categoryIcon: string | null;
      content: ReminderContent;
      times: { time: string; status: string | null }[];
      todayTotal: number;
      untimed: boolean;
      /** #20：是否计入完成率（今日完成率方框可逐条勾选） */
      countInRate: boolean;
    }[] = [];

    for (const r of reminders) {
      // 1. 该日期是否匹配重复规则
      const rule = r.repeatRule;
      let matched = false;
      switch (rule.type) {
        case RepeatType.ONCE: {
          const sd = toLocal(r.startDate, timezone);
          matched = sd.year === y && sd.month === m && sd.day === d;
          break;
        }
        case RepeatType.DAILY:
          matched = true;
          break;
        case RepeatType.WEEKLY: {
          const days = rule.daysOfWeek ?? [];
          matched = days.length === 0 ? true : days.includes(dayLocal.weekday);
          break;
        }
        case RepeatType.MONTHLY: {
          const target = Math.min(rule.dayOfMonth ?? 1, lastDayOfMonth(y, m));
          matched = dayLocal.day === target;
          break;
        }
        case RepeatType.INTERVAL: {
          const unit = rule.intervalUnit ?? IntervalUnit.DAY;
          if (unit === IntervalUnit.HOUR) {
            matched = true; // 按小时：每天从 startTime 起循环
          } else {
            const sd = toLocal(r.startDate, timezone);
            const days = Math.round(
              (dayStart.getTime() - localToUtc(timezone, sd.year, sd.month, sd.day, 0, 0).getTime()) /
                86_400_000,
            );
            const step = unit === IntervalUnit.WEEK ? (rule.intervalValue ?? 1) * 7 : (rule.intervalValue ?? 1);
            matched = days >= 0 && days % step === 0;
          }
          break;
        }
      }
      if (!matched) continue;

      // 2. 该日期的时间点
      let times: string[];
      if (r.times && r.times.length > 0) {
        times = r.times;
      } else if (r.repeatRule.type === RepeatType.INTERVAL && r.repeatRule.intervalUnit === IntervalUnit.HOUR) {
        // 按小时：当天从 startTime 起每 N 小时的时间点
        const stepMs = (r.repeatRule.intervalValue ?? 1) * 3_600_000;
        const sd = toLocal(r.startDate, timezone);
        const dayEnd = localToUtc(timezone, y, m, d + 1, 0, 0).getTime();
        times = [];
        let t = localToUtc(timezone, y, m, d, sd.hour, sd.minute).getTime();
        while (t < dayEnd) {
          times.push(toLocalTimeStr(new Date(t), timezone));
          t += stepMs;
        }
        if (times.length === 0) times = [toLocalTimeStr(r.startDate, timezone)];
      } else {
        times = [toLocalTimeStr(r.startDate, timezone)];
      }
      const dayLogs = logs.filter((l) => l.reminderId === r.id);
      // 不定时提醒：无 times 且非按小时 interval（每天在创建时刻提醒，界面不显示具体时间）
      const untimed =
        (!r.times || r.times.length === 0) &&
        !(r.repeatRule.type === RepeatType.INTERVAL && r.repeatRule.intervalUnit === IntervalUnit.HOUR);

      result.push({
        reminderId: r.id,
        nextTriggerAt: r.nextTriggerAt,
        title: r.title,
        category: r.category,
        categoryLabel: r.categoryLabel,
        categoryIcon: r.categoryIcon,
        content: r.content,
        times: times.map((t) => {
          const [hh, mm] = t.split(':').map(Number);
          const slot = localToUtc(timezone, y, m, d, hh, mm);
          // 与 logs 匹配（同一天同一时刻只可能一条，取状态）
          const log = dayLogs.find((l) => Math.abs(l.scheduledTime.getTime() - slot.getTime()) < 60_000);
          // 不定时提醒：不显示"错过"（无固定时间点，不存在超时漏服；#12）
          const status = untimed && log?.status === ReminderLogStatus.MISSED ? null : (log?.status ?? null);
          return { time: t, status };
        }),
        todayTotal: times.length,
        untimed,
        countInRate: r.countInRate !== false,
      });
    }

    // 不定时提醒置顶（#12），其余按第一个时间点排序
    result.sort((a, b) =>
      a.untimed === b.untimed ? a.times[0].time.localeCompare(b.times[0].time) : a.untimed ? -1 : 1,
    );
    return result;
  }
  async today(userId: string) {
    const timezone = await this.getUserTimezone(userId);
    const reminders = await this.reminderRepo.find({
      where: { userId, isActive: true },
    });

    const now = new Date();
    const local = toLocal(now, timezone);
    const todayStart = localToUtc(timezone, local.year, local.month, local.day, 0, 0);
    const tomorrowStart = localToUtc(timezone, local.year, local.month, local.day + 1, 0, 0);

    const logs = await this.logRepo.find({
      where: { userId, scheduledTime: Between(todayStart, tomorrowStart) },
      order: { scheduledTime: 'ASC' },
    });

    return reminders
      .map((r) => {
        const todayLogs = logs
          .filter((l) => l.reminderId === r.id)
          .map((l) => ({
            id: l.id,
            scheduledTime: l.scheduledTime,
            status: l.status,
          }));
        const next = r.nextTriggerAt ? new Date(r.nextTriggerAt) : null;
        const willTriggerToday = next !== null && next >= todayStart && next < tomorrowStart;
        if (todayLogs.length === 0 && !willTriggerToday) return null;
        return {
          ...r,
          todayLogs,
          // 今日计划总次数（多时间点提醒 = 时间点数量，其余 = 1）
          todayTotal: r.times && r.times.length > 0 ? r.times.length : 1,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  async findOne(userId: string, id: string) {
    const reminder = await this.reminderRepo.findOne({ where: { id, userId } });
    if (!reminder) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '提醒不存在' });
    }
    return reminder;
  }

  /** 更新：重算 nextTriggerAt；修改仅影响下一触发周期（不追溯历史） */
  async update(userId: string, id: string, dto: UpdateReminderDto) {
    const reminder = await this.findOne(userId, id);
    const timezone = await this.getUserTimezone(userId);

    // 剔除非 Reminder 实体字段（waterGoalMl 属 UserSetting，误入 dto 展开会导致 TypeORM 500）
    const { waterGoalMl: _waterGoalMl, ...dtoRest } = dto as UpdateReminderDto & { waterGoalMl?: number };

    const next = { ...reminder.repeatRule, ...(dtoRest.repeatRule ?? {}) };
    const startDate = dtoRest.startDate ? new Date(dtoRest.startDate) : reminder.startDate;
    const endDate = dtoRest.endDate !== undefined ? (dtoRest.endDate ? new Date(dtoRest.endDate) : null) : reminder.endDate;
    const times = dtoRest.times !== undefined ? dtoRest.times : reminder.times;

    const patch: Partial<Reminder> = {
      ...dtoRest,
      repeatRule: next,
      startDate,
      endDate,
      times,
      nextTriggerAt: computeNextTrigger(next, new Date(), startDate, endDate, timezone, times),
    };
    // 注意：不能用 save(entity)——TypeORM 1.x 对带 transformer 的列会写入数据库旧值
    // 计划提醒被用户修改 → 打标（前端展示"已修改"，#8）
    if (reminder.planId) {
      patch.modifiedFromPlan = true;
    }
    await this.reminderRepo.update({ id, userId }, patch);
    return this.findOne(userId, id);
  }

  /** 软删除：#18 删除计划内（部分/全部）提醒 → 对应计划开关自动关闭（其余提醒保留、配置可重建） */
  async remove(userId: string, id: string) {
    const reminder = await this.findOne(userId, id);
    await this.reminderRepo.softDelete(reminder.id);
    if (reminder.planId) {
      try {
        // 只关开关，不删除其余提醒（仅计划开关本身才清除全部提醒）
        await this.dataSource.getRepository(Plan).update({ id: reminder.planId, userId }, { isActive: false });
      } catch {
        /* 计划已删除等：忽略 */
      }
    }
    void this.audit.record('reminder.delete', userId, { targetType: 'reminder', targetId: id });
    return { success: true };
  }

  /** 启停 */
  async setActive(userId: string, id: string, isActive: boolean) {
    const reminder = await this.findOne(userId, id);
    let nextTriggerAt = reminder.nextTriggerAt;
    if (isActive && !reminder.nextTriggerAt) {
      const timezone = await this.getUserTimezone(userId);
      nextTriggerAt = computeNextTrigger(
        reminder.repeatRule,
        new Date(),
        reminder.startDate,
        reminder.endDate,
        timezone,
      );
    }
    await this.reminderRepo.update({ id, userId }, { isActive, nextTriggerAt });
    return this.findOne(userId, id);
  }

  /**
   * 执行上报（FR-204~207）：幂等（UNIQUE reminderId+scheduledTime）。
   * 状态机：
   *  - completed / challenge_completed → 写日志 + 重排下一次 + （M2）扣库存
   *  - delayed → 写日志 + nextTriggerAt = 上报时间 + delayMinutes
   *  - skipped → 写日志 + 重排下一次
   */
  async ack(userId: string, id: string, dto: AckReminderDto) {
    const reminder = await this.findOne(userId, id);
    const timezone = await this.getUserTimezone(userId);
    const scheduledTime = new Date(dto.scheduledTime);

    const result = await this.dataSource.transaction(async (manager) => {
      const logRepo = manager.getRepository(ReminderLog);
      const reminderRepo = manager.getRepository(Reminder);

      // 幂等：同一时刻已记录则直接返回（不重复扣库存/重排）
      const existing = await logRepo.findOne({ where: { reminderId: id, scheduledTime } });
      if (existing) return { ok: true, log: existing, duplicate: true };

      const isCompleted =
        dto.status === ReminderLogStatus.COMPLETED ||
        dto.status === ReminderLogStatus.CHALLENGE_COMPLETED;

      const log = logRepo.create({
        id: randomUUID(),
        reminderId: id,
        userId,
        scheduledTime,
        actualTime: new Date(),
        status: dto.status,
        delayMinutes: dto.status === ReminderLogStatus.DELAYED ? dto.delayMinutes ?? 0 : 0,
        photoUrl: dto.photoUrl ?? null,
        medicineId: reminder.medicineId,
        medicineNameSnapshot: null,
        category: reminder.category,
        amount:
          reminder.category === 'water'
            ? (reminder.content as ReminderContent & { waterAmountMl?: number }).waterAmountMl ?? 200
            : 0,
        stockDeducted: 0,
      });

      if (reminder.medicineId) {
        const medicine = await manager.getRepository(Medicine).findOne({
          where: { id: reminder.medicineId, userId },
        });
        if (medicine) {
          log.medicineNameSnapshot = medicine.name;
          // M2 库存扣减（事务内）：确认服药 → 扣减 → 预警 → 站内通知
          if (isCompleted && medicine.deductionPerUse > 0) {
            if (medicine.stock < medicine.deductionPerUse) {
              throw new BadRequestException({
                code: 'STOCK_EXCEEDED',
                message: `${medicine.name} 库存不足：当前仅剩 ${medicine.stock} ${medicine.dosage ?? '份'}`,
              });
            }
            const newStock = medicine.stock - medicine.deductionPerUse;
            await manager.getRepository(Medicine).update(
              { id: medicine.id, userId },
              { stock: newStock },
            );
            log.stockDeducted = medicine.deductionPerUse;
            // 库存预警：扣减后 ≤ 阈值 → 站内通知
            if (medicine.notifyOnLowStock && newStock <= medicine.threshold && medicine.threshold > 0) {
              await manager.getRepository(Notification).save(
                manager.getRepository(Notification).create({
                  id: randomUUID(),
                  userId,
                  type: NotificationType.LOW_STOCK,
                  title: '库存预警',
                  content: `${medicine.name} 库存仅剩 ${newStock} ${medicine.dosage ?? '份'}，请及时补充`,
                  linkUrl: '/medicines',
                }),
              );
            }
          }
        }
      }

      await logRepo.save(log);

      // 调度重排（TypeORM 1.x 的 save 对 transformer 列写旧值，故用 update）
      const now = new Date();
      if (dto.status === ReminderLogStatus.DELAYED) {
        const delayMs = (dto.delayMinutes ?? 0) * 60_000;
        await reminderRepo.update(
          { id, userId },
          { nextTriggerAt: new Date(now.getTime() + delayMs) },
        );
      } else if (reminder.repeatRule.type === RepeatType.ONCE) {
        await reminderRepo.update({ id, userId }, { nextTriggerAt: null });
      } else {
        await reminderRepo.update(
          { id, userId },
          {
            nextTriggerAt: computeFollowingTrigger(
              reminder.repeatRule,
              scheduledTime,
              reminder.startDate,
              reminder.endDate,
              timezone,
              reminder.times,
            ),
          },
        );
      }

      return { ok: true, log, duplicate: false };
    });

    // 成就检查（FR-708，fire-and-forget：失败不影响 ack 结果；规则表驱动 + UNIQUE 幂等）
    void this.achievements.check(userId).catch(() => undefined);
    return result;
  }

  /**
   * 喝水手动记录（FR-403）：写入 ReminderLog(status=manual, category=water, amount=ml)。
  /**
   * 手动喝水记录（看板 +200ml 等；#4：按日期独立——记录写入指定日期的当日正午，
   * 永不与其它日期串扰；dateStr 缺省 = 今天（用户时区））
   */
  async waterLog(userId: string, amountMl: number, scheduledAt?: Date) {
    if (!Number.isInteger(amountMl) || amountMl <= 0 || amountMl > 5000) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '水量须为 1~5000ml 的整数' });
    }
    const log = this.logRepo.create({
      id: randomUUID(),
      reminderId: null,
      userId,
      scheduledTime: scheduledAt ?? new Date(),
      actualTime: new Date(),
      status: ReminderLogStatus.MANUAL,
      delayMinutes: 0,
      photoUrl: null,
      medicineId: null,
      medicineNameSnapshot: null,
      category: 'water',
      amount: amountMl,
      stockDeducted: 0,
    });
    return this.logRepo.save(log);
  }

  /** 手动延迟（独立接口，前端弹窗延迟按钮用；与 ack 分离避免误写完成记录） */
  async delay(userId: string, id: string, minutes: number) {
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '延迟分钟数须为 1~1440 的整数' });
    }
    return this.ack(userId, id, {
      status: ReminderLogStatus.DELAYED,
      scheduledTime: new Date().toISOString(),
      delayMinutes: minutes,
    });
  }

  /** 某提醒的执行记录（分页） */
  async logs(userId: string, reminderId: string, page = 1, pageSize = 20) {
    const [items, total] = await this.logRepo.findAndCount({
      where: { reminderId, userId },
      order: { scheduledTime: 'DESC' },
      skip: (page - 1) * pageSize,
      take: Math.min(pageSize, 100),
    });
    return { items, total, page, pageSize };
  }
}
