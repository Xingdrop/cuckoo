/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9yZW1pbmRlcnMvcmVtaW5kZXJzLnNlcnZpY2UudHN8MjAyNi0wOXxlOWIxOTdlYjI2 */
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
import { Between, DataSource, EntityManager, Repository } from 'typeorm';
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
  RepeatRule,
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

/**
 * #7（2026-09-09 晚）：找「原计划槽 + delayMinutes ≈ 目标时刻」的 delayed 日志。
 * 延迟重弹后的 ack/漏服扫描拿到的槽是「新时刻」，精确查询必落空 → 回匹配原槽日志。
 * SQLite datetime 秒级精度：nextTriggerAt 毫秒被截断，容差 90s（预设最短延迟 5 分钟，互不误伤）。
 * 供 reminders.service（ack 归槽）与 missed-scanner（原槽升级 missed）共用。
 */
export async function findDelayedLogForSlot(
  logRepo: Repository<ReminderLog>,
  reminderId: string,
  target: Date,
): Promise<ReminderLog | null> {
  const candidates = await logRepo.find({
    where: { reminderId, status: ReminderLogStatus.DELAYED },
    order: { scheduledTime: 'DESC' },
    take: 50,
  });
  let best: ReminderLog | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const log of candidates) {
    if (!log.delayMinutes) continue;
    const diff = Math.abs(log.scheduledTime.getTime() + log.delayMinutes * 60_000 - target.getTime());
    if (diff <= 90_000 && diff < bestDiff) {
      best = log;
      bestDiff = diff;
    }
  }
  return best;
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
  /** 服务器防护：单用户提醒数量上限（防本地数据洪泛破坏数据库） */
  private static readonly MAX_REMINDERS = 200;

  async create(userId: string, dto: CreateReminderDto) {
    const count = await this.reminderRepo.count({ where: { userId } });
    if (count >= RemindersService.MAX_REMINDERS) {
      throw new BadRequestException({
        code: 'LIMIT_REACHED',
        message: `提醒数量已达上限（${RemindersService.MAX_REMINDERS} 条），请先清理不需要的提醒`,
      });
    }
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
      /** #26 详情浮窗：重复规则（前端生成人话描述） */
      repeatRule: RepeatRule;
      times: { time: string; status: string | null; delayMinutes: number }[];
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
        // #26 详情浮窗：重复规则描述需要完整 rule
        repeatRule: r.repeatRule,
        times: times.map((t) => {
          const [hh, mm] = t.split(':').map(Number);
          const slot = localToUtc(timezone, y, m, d, hh, mm);
          // 与 logs 匹配（同一天同一时刻只可能一条，取状态）
          const log = dayLogs.find((l) => Math.abs(l.scheduledTime.getTime() - slot.getTime()) < 60_000);
          // 不定时提醒：不显示"错过"（无固定时间点，不存在超时漏服；#12）
          const status = untimed && log?.status === ReminderLogStatus.MISSED ? null : (log?.status ?? null);
          // #8：延迟中的槽位带上累计延迟分钟数（前端据此显示新时间）
          return { time: t, status, delayMinutes: log?.delayMinutes ?? 0 };
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

  /** M2 库存扣减 + 预警（事务内；ack 新建日志/延迟落地/错过补完成共用）。会原地回填 log 快照字段 */
  private async settleStock(
    manager: EntityManager,
    reminder: Reminder,
    log: ReminderLog,
    userId: string,
    isCompleted: boolean,
  ): Promise<void> {
    if (!reminder.medicineId) return;
    const medicine = await manager.getRepository(Medicine).findOne({
      where: { id: reminder.medicineId, userId },
    });
    if (!medicine) return;
    log.medicineNameSnapshot = medicine.name;
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

  /**
   * 执行上报（FR-204~207）：幂等（UNIQUE reminderId+scheduledTime）。
   * 状态机：
   *  - completed / challenge_completed → 写日志 + 重排下一次 + （M2）扣库存
   *  - delayed → 写日志 + nextTriggerAt = 上报时间 + delayMinutes
   *  - skipped → 写日志 + 重排下一次
   *  #8：延迟后到期再操作 → 落回原计划时刻的 delayed 日志（当日列表按原时刻归槽显示新状态）；
   *     弹窗 3 分钟自动判错过（或漏服扫描）后补完成/放弃 → 原槽 missed 日志直接升级
   */
  async ack(userId: string, id: string, dto: AckReminderDto) {
    const reminder = await this.findOne(userId, id);
    const timezone = await this.getUserTimezone(userId);
    const scheduledTime = new Date(dto.scheduledTime);

    const result = await this.dataSource.transaction(async (manager) => {
      const logRepo = manager.getRepository(ReminderLog);
      const reminderRepo = manager.getRepository(Reminder);

      const isCompleted =
        dto.status === ReminderLogStatus.COMPLETED ||
        dto.status === ReminderLogStatus.CHALLENGE_COMPLETED;
      const isTerminal = isCompleted || dto.status === ReminderLogStatus.SKIPPED;

      // 幂等：同一时刻已记录则按语义处理（不重复扣库存/重排）
      let existing = await logRepo.findOne({ where: { reminderId: id, scheduledTime } });
      // #7（2026-09-09 晚）：延迟重弹后的 ack——上报槽 = 原槽 + 延迟分钟（弹窗重弹时
      // nextTriggerAt 已是新时刻），精确槽无日志，原槽挂着 delayed → 永远「即将提醒」。
      // 按「原槽 + delayMinutes ≈ 上报时刻」回匹配原槽日志视同同槽：完成/放弃就地升级，
      // 再延迟就地累计，杜绝幻影槽 + 原槽 delayed 悬挂。
      if (!existing) {
        const delayedSlot = await findDelayedLogForSlot(logRepo, id, scheduledTime);
        if (delayedSlot) existing = delayedSlot;
      }
      if (existing) {
        // #26：拍照记录重复上报 = 替换照片（更新 photoUrl 与时间，不改状态）；文字记录随报随更
        if (dto.status === ReminderLogStatus.PHOTO && dto.photoUrl) {
          await logRepo.update(
            { id: existing.id },
            { photoUrl: dto.photoUrl, actualTime: new Date(), note: dto.note ?? existing.note },
          );
          return { ok: true, log: { ...existing, photoUrl: dto.photoUrl, actualTime: new Date() }, duplicate: true, replaced: true };
        }

        // #58（2026-09-09）：留言槽升级——对「留言」槽完成/放弃/拍照时状态随之升级。
        // 否则走 duplicate 分支只更 note 不改状态，「标记完成」在留言过的槽位上会失效。
        if (existing.status === ReminderLogStatus.NOTE && (isTerminal || dto.status === ReminderLogStatus.PHOTO)) {
          const patch: Partial<ReminderLog> = {
            status: dto.status,
            actualTime: new Date(),
            photoUrl: dto.photoUrl ?? existing.photoUrl,
            note: dto.note ?? existing.note,
          };
          const log = { ...existing, ...patch } as ReminderLog;
          await this.settleStock(manager, reminder, log, userId, isCompleted);
          await logRepo.update({ id: existing.id }, patch);
          return { ok: true, log, duplicate: true, upgraded: true };
        }

        // #8：延迟后完成/放弃 → 落到原计划时刻的 delayed 日志（同槽一条记录）。
        // 2026-09-07 真机修复：详情弹窗/看板用「原时刻」上报，与「原时刻+延迟分钟」相差 ≥1 分钟，
        // 原 60 秒窗口判定不成立 → 走 duplicate 分支静默丢弃 → 行永远显示「即将提醒」。
        // 唯一索引已按 reminderId+scheduledTime 归槽，同槽终端状态上报一律升级，不再比对时间窗。
        const delayedLanded = existing.status === ReminderLogStatus.DELAYED && isTerminal;
        // 错过（3 分钟弹窗过期/漏服扫描）后补完成/放弃 → 原槽升级
        const missedUpgrade = existing.status === ReminderLogStatus.MISSED && isTerminal;

        if (delayedLanded || missedUpgrade) {
          const basis = existing.scheduledTime;
          const patch: Partial<ReminderLog> = {
            status: dto.status,
            actualTime: new Date(),
            photoUrl: dto.photoUrl ?? existing.photoUrl,
            note: dto.note ?? existing.note,
          };
          const log = { ...existing, ...patch } as ReminderLog;
          await this.settleStock(manager, reminder, log, userId, isCompleted);
          await logRepo.update({ id: existing.id }, {
            ...patch,
            medicineNameSnapshot: log.medicineNameSnapshot,
            stockDeducted: log.stockDeducted,
          });
          // 以原计划时刻为基准重排
          if (reminder.repeatRule.type === RepeatType.ONCE) {
            await reminderRepo.update({ id, userId }, { nextTriggerAt: null });
          } else {
            await reminderRepo.update(
              { id, userId },
              {
                nextTriggerAt: computeFollowingTrigger(
                  reminder.repeatRule,
                  basis,
                  reminder.startDate,
                  reminder.endDate,
                  timezone,
                  reminder.times,
                ),
              },
            );
          }
          return { ok: true, log, duplicate: false, upgraded: true };
        }

        // #8：同一槽二次延迟（或错过后再延迟）→ 以原时刻为基准累计延迟分钟并顺延
        if (
          dto.status === ReminderLogStatus.DELAYED &&
          (existing.status === ReminderLogStatus.DELAYED || existing.status === ReminderLogStatus.MISSED)
        ) {
          const totalDelayMin = Math.max(
            Math.round((Date.now() + (dto.delayMinutes ?? 0) * 60_000 - existing.scheduledTime.getTime()) / 60_000),
            existing.delayMinutes ?? 0,
          );
          await logRepo.update(
            { id: existing.id },
            {
              status: ReminderLogStatus.DELAYED,
              delayMinutes: totalDelayMin,
              actualTime: new Date(),
              note: dto.note ?? existing.note,
            },
          );
          await reminderRepo.update(
            { id, userId },
            { nextTriggerAt: new Date(Date.now() + (dto.delayMinutes ?? 0) * 60_000) },
          );
          return { ok: true, log: { ...existing, status: ReminderLogStatus.DELAYED, delayMinutes: totalDelayMin }, duplicate: true, delayed: true };
        }

        if (dto.note) {
          await logRepo.update({ id: existing.id }, { note: dto.note });
        }
        return { ok: true, log: existing, duplicate: true };
      }

      const log = logRepo.create({
        id: randomUUID(),
        reminderId: id,
        userId,
        scheduledTime,
        actualTime: new Date(),
        status: dto.status,
        delayMinutes: dto.status === ReminderLogStatus.DELAYED ? dto.delayMinutes ?? 0 : 0,
        photoUrl: dto.photoUrl ?? null,
        note: dto.note ?? null,
        medicineId: reminder.medicineId,
        medicineNameSnapshot: null,
        category: reminder.category,
        amount:
          reminder.category === 'water'
            ? (reminder.content as ReminderContent & { waterAmountMl?: number }).waterAmountMl ?? 200
            : 0,
        stockDeducted: 0,
      });

      await this.settleStock(manager, reminder, log, userId, isCompleted);

      await logRepo.save(log);

      // 调度重排（TypeORM 1.x 的 save 对 transformer 列写旧值，故用 update）
      const now = new Date();
      if (dto.status === ReminderLogStatus.PHOTO) {
        // #26：拍照记录不推进提醒调度（独立于完成标记）
      } else if (dto.status === ReminderLogStatus.DELAYED) {
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
   * #58（2026-09-09）：详情弹窗随手记（纯留言）——写入/更新该槽位日志的 note。
   * 槽位无日志 → 新建 NOTE 状态日志（不改完成状态、不推进调度、不计入完成率）；
   * 已有日志（待完成除外）→ 仅更新 note，保留原状态；不存在的提醒/越权 → 404。
   */
  async upsertNote(userId: string, id: string, scheduledTimeIso: string, note: string) {
    const trimmed = note.trim();
    if (!trimmed || trimmed.length > 500) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '留言须为 1~500 字' });
    }
    const reminder = await this.reminderRepo.findOne({ where: { id, userId } });
    if (!reminder) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '提醒不存在' });
    }
    const scheduledTime = new Date(scheduledTimeIso);
    if (Number.isNaN(scheduledTime.getTime())) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'scheduledTime 无效' });
    }
    return this.dataSource.transaction(async (manager) => {
      const logRepo = manager.getRepository(ReminderLog);
      const existing = await logRepo.findOne({ where: { reminderId: id, scheduledTime } });
      if (existing) {
        await logRepo.update({ id: existing.id }, { note: trimmed, actualTime: new Date() });
        return { ok: true, logId: existing.id };
      }
      const log = logRepo.create({
        id: randomUUID(),
        reminderId: id,
        userId,
        scheduledTime,
        actualTime: new Date(),
        status: ReminderLogStatus.NOTE,
        delayMinutes: 0,
        photoUrl: null,
        medicineId: reminder.medicineId,
        medicineNameSnapshot: null,
        category: reminder.category,
        amount: 0,
        stockDeducted: 0,
        note: trimmed,
      });
      await logRepo.save(log);
      return { ok: true, logId: log.id };
    });
  }

  /**
   * 喝水手动记录（FR-403）：写入 ReminderLog(status=manual, category=water, amount=ml)。
  /**
   * 手动喝水记录（看板 +200ml 等；#4：按日期独立——记录写入指定日期的当日正午，
   * 永不与其它日期串扰；dateStr 缺省 = 今天（用户时区））
   */
  /** 服务器防护：每日喝水记录条数上限（防灌库） */
  private static readonly MAX_WATER_LOGS_PER_DAY = 60;

  async waterLog(userId: string, amountMl: number, scheduledAt?: Date) {
    if (!Number.isInteger(amountMl) || amountMl <= 0 || amountMl > 5000) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '水量须为 1~5000ml 的整数' });
    }
    // 当日喝水记录条数校验（同日 60 条 = 5000ml×60 的极端情况封顶）
    const dayStart = scheduledAt ?? new Date();
    const start = new Date(dayStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const dayCount = await this.logRepo.count({
      where: { userId, category: 'water', scheduledTime: Between(start, end) },
    });
    if (dayCount >= RemindersService.MAX_WATER_LOGS_PER_DAY) {
      throw new BadRequestException({
        code: 'LIMIT_REACHED',
        message: `今日喝水记录已达上限（${RemindersService.MAX_WATER_LOGS_PER_DAY} 条）`,
      });
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
    // #8：以当前待触发时刻（原计划槽）为基准记录 delayed——当日列表才能按原时刻归槽并显示新时间
    const reminder = await this.findOne(userId, id);
    if (!reminder.nextTriggerAt) {
      throw new BadRequestException({ code: 'NOT_SCHEDULED', message: '当前没有待触发的提醒' });
    }
    return this.ack(userId, id, {
      status: ReminderLogStatus.DELAYED,
      scheduledTime: new Date(reminder.nextTriggerAt).toISOString(),
      delayMinutes: minutes,
    });
  }

  /** #26：替换某条日志的照片（详情页再次拍照——保留记录，更新 photoUrl 与时间） */
  async replaceLogPhoto(userId: string, logId: string, photoUrl: string) {
    const found = await this.logRepo.findOne({ where: { id: logId, userId } });
    if (!found) throw new BadRequestException({ code: 'NOT_FOUND', message: '记录不存在' });
    await this.logRepo.update({ id: logId, userId }, { photoUrl, actualTime: new Date() });
    return { ok: true, log: { ...found, photoUrl } };
  }

  /** 某提醒的执行记录（分页） */
  async logs(userId: string, reminderId: string, page = 1, pageSize = 20) {    const [items, total] = await this.logRepo.findAndCount({
      where: { reminderId, userId },
      order: { scheduledTime: 'DESC' },
      skip: (page - 1) * pageSize,
      take: Math.min(pageSize, 100),
    });
    return { items, total, page, pageSize };
  }
}
