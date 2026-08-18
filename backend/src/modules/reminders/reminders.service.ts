import {
  BadRequestException,
  ConflictException,
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
import { User } from '../users/user.entity';
import { AckReminderDto } from './dto/ack-reminder.dto';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { ReminderLog, ReminderLogStatus } from './reminder-log.entity';
import { Reminder, RepeatType } from './reminder.entity';

const DEFAULT_TZ = 'Asia/Shanghai';

@Injectable()
export class RemindersService {
  constructor(
    @InjectRepository(Reminder)
    private readonly reminderRepo: Repository<Reminder>,
    @InjectRepository(ReminderLog)
    private readonly logRepo: Repository<ReminderLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  private async getUserTimezone(userId: string): Promise<string> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return user?.timezone ?? DEFAULT_TZ;
  }

  /** 创建提醒：计算首次 nextTriggerAt（调度引擎依赖） */
  async create(userId: string, dto: CreateReminderDto) {
    const timezone = await this.getUserTimezone(userId);
    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : null;

    const reminder = this.reminderRepo.create({
      id: randomUUID(),
      userId,
      category: dto.category,
      title: dto.title,
      repeatRule: dto.repeatRule,
      startDate,
      endDate,
      content: dto.content ?? {},
      method: dto.method ?? {},
      delaySettings: dto.delaySettings ?? {},
      challenge: dto.challenge ?? {},
      medicineId: dto.medicineId ?? null,
      isActive: dto.isActive ?? true,
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
    return qb.getMany();
  }

  /**
   * 今日概览（看板数据源）：
   * 返回今日"相关"的提醒（今日将触发 或 今日已有执行记录），附今日执行日志。
   * 前端据此展示：未到提醒 + 已完成提醒（含"已提醒 n 次"折叠）。
   */
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
        return { ...r, todayLogs };
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

    const next = { ...reminder.repeatRule, ...(dto.repeatRule ?? {}) };
    const startDate = dto.startDate ? new Date(dto.startDate) : reminder.startDate;
    const endDate = dto.endDate !== undefined ? (dto.endDate ? new Date(dto.endDate) : null) : reminder.endDate;
    const times = dto.times !== undefined ? dto.times : reminder.times;

    const patch = {
      ...dto,
      repeatRule: next,
      startDate,
      endDate,
      times,
      nextTriggerAt: computeNextTrigger(next, new Date(), startDate, endDate, timezone, times),
    };
    // 注意：不能用 save(entity)——TypeORM 1.x 对带 transformer 的列会写入数据库旧值
    await this.reminderRepo.update({ id, userId }, patch);
    return this.findOne(userId, id);
  }

  /** 软删除 */
  async remove(userId: string, id: string) {
    const reminder = await this.findOne(userId, id);
    await this.reminderRepo.softDelete(reminder.id);
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

    return this.dataSource.transaction(async (manager) => {
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
        stockDeducted: 0,
      });

      if (reminder.medicineId) {
        const medicine = await manager.getRepository(Medicine).findOne({
          where: { id: reminder.medicineId, userId },
        });
        if (medicine) {
          log.medicineNameSnapshot = medicine.name;
          if (isCompleted && medicine.deductionPerUse > 0) {
            // M2 库存扣减将在此事务内扩展（stock 扣减 + 预警判定）
            log.stockDeducted = medicine.deductionPerUse;
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
