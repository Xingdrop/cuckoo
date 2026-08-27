import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { localToUtc, toLocal } from '../../common/reminder-schedule';
import { RemindersService } from '../reminders/reminders.service';
import { ReminderLog, ReminderLogStatus } from '../reminders/reminder-log.entity';
import { UserSetting } from '../users/user-setting.entity';

const DONE_STATUSES = [ReminderLogStatus.COMPLETED, ReminderLogStatus.CHALLENGE_COMPLETED];

/** 统计口径（需求文档 §6.3）：完成率 = 完成数 / 应执行数（跳过不计入分母） */
@Injectable()
export class StatsService {
  constructor(
    private readonly remindersService: RemindersService,
    @InjectRepository(ReminderLog)
    private readonly logRepo: Repository<ReminderLog>,
    @InjectRepository(UserSetting)
    private readonly settingRepo: Repository<UserSetting>,
  ) {}

  /** 某天的完成率（planned=应执行数，done=完成数）——#20 仅统计「计入完成率」的提醒 */
  private async dayRate(userId: string, dateStr: string) {
    const plan = await this.remindersService.dayPlan(userId, dateStr);
    let planned = 0;
    let done = 0;
    for (const item of plan) {
      if (item.countInRate === false) continue; // 用户未勾选该提醒计入完成率
      for (const t of item.times) {
        if (t.status !== 'skipped') planned += 1;
        if (t.status === 'completed' || t.status === 'challenge_completed') done += 1;
      }
    }
    return { planned, done, rate: planned > 0 ? Math.round((done / planned) * 100) : done > 0 ? 100 : 0 };
  }

  /**
   * 今日看板统计（FR-701/702/707）：
   * 今日完成率 / 连续天数 / 分类统计 / 喝水进度
   */
  async dashboard(userId: string) {
    const tz = await this.getTz(userId);
    const now = new Date();
    const local = toLocal(now, tz);
    const dateStr = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;

    const today = await this.dayRate(userId, dateStr);
    const plan = await this.remindersService.dayPlan(userId, dateStr);

    // 分类统计（今日各分类完成/计划）
    const categoryStats: Record<string, { planned: number; done: number; rate: number }> = {};
    for (const item of plan) {
      const key = item.categoryLabel ?? item.category;
      if (!categoryStats[key]) categoryStats[key] = { planned: 0, done: 0, rate: 0 };
      for (const t of item.times) {
        if (t.status !== 'skipped') categoryStats[key].planned += 1;
        if (t.status === 'completed' || t.status === 'challenge_completed') categoryStats[key].done += 1;
      }
      categoryStats[key].rate =
        categoryStats[key].planned > 0
          ? Math.round((categoryStats[key].done / categoryStats[key].planned) * 100)
          : 0;
    }

    // 喝水进度（今日 water 记录累计）
    const dayStart = localToUtc(tz, local.year, local.month, local.day, 0, 0);
    const nextDay = localToUtc(tz, local.year, local.month, local.day + 1, 0, 0);
    const waterLogs = await this.logRepo.find({
      where: { userId, category: 'water', scheduledTime: Between(dayStart, nextDay) },
    });
    const waterMl = waterLogs.reduce((sum, l) => sum + l.amount, 0);
    const setting = await this.settingRepo.findOne({ where: { userId } });
    const waterGoalMl = setting?.waterGoalMl ?? 2000;

    return {
      date: dateStr,
      ...today,
      missed: plan.reduce(
        (sum, item) => sum + item.times.filter((t) => t.status === 'missed').length,
        0,
      ),
      streakDays: await this.calcStreak(userId, dateStr),
      categoryStats,
      water: {
        waterMl,
        waterGoalMl,
        rate: Math.min(100, Math.round((waterMl / waterGoalMl) * 100)),
        // #3：水目标达成独立标记（后台以 waterLogs 记录，不混入完成率/连续天数）
        waterGoalReached: waterGoalMl > 0 && waterMl >= waterGoalMl,
      },
    };
  }

  /**
   * 连续天数（FR-702）：从今天（今天未全完成则从昨天）回溯，
   * 每天全部完成才计入；中断即停。
   */
  async calcStreak(userId: string, todayStr: string): Promise<number> {
    const tz = await this.getTz(userId);
    const [y, m, d] = todayStr.split('-').map(Number);
    const todayRate = await this.dayRate(userId, todayStr);

    let streak = 0;
    // 今天全部完成 → 计入；否则从昨天开始
    let cursor = todayRate.done > 0 && todayRate.planned > 0 && todayRate.done >= todayRate.planned
      ? todayStr
      : null;
    let offset = 0;
    // 最多回溯 365 天
    while (offset < 365) {
      const date = cursor
        ? localToUtc(tz, y, m, d - offset, 0, 0)
        : localToUtc(tz, y, m, d - 1 - offset, 0, 0);
      const l = toLocal(date, tz);
      const key = `${l.year}-${String(l.month).padStart(2, '0')}-${String(l.day).padStart(2, '0')}`;
      const rate = await this.dayRate(userId, key);
      if (rate.planned > 0 && rate.done >= rate.planned) {
        streak += 1;
      } else if (rate.planned > 0) {
        break; // 有安排但未全完成 → 中断
      }
      // planned=0（无安排）→ 跳过继续（不计入也不中断）
      offset += 1;
    }
    return streak;
  }

  /** 月热力图（FR-705/706）：当月每天完成率 */
  async heatmap(userId: string, monthStr: string) {
    const tz = await this.getTz(userId);
    const [y, m] = monthStr.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const result: { date: string; rate: number; done: number; planned: number }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const rate = await this.dayRate(userId, key);
      result.push({ date: key, ...rate });
    }
    return result;
  }

  /** 近 N 天趋势（FR-703） */
  async trend(userId: string, days = 7) {
    const tz = await this.getTz(userId);
    const now = new Date();
    const local = toLocal(now, tz);
    const result: { date: string; rate: number; done: number; planned: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = localToUtc(tz, local.year, local.month, local.day - i, 0, 0);
      const l = toLocal(d, tz);
      const key = `${l.year}-${String(l.month).padStart(2, '0')}-${String(l.day).padStart(2, '0')}`;
      const rate = await this.dayRate(userId, key);
      result.push({ date: key, ...rate });
    }
    return result;
  }

  /** #4：某日喝水统计（dateStr 缺省 = 今天；按用户时区日界独立计算） */
  async waterInfo(userId: string, dateStr?: string) {
    const tz = await this.getTz(userId);
    let y: number, m: number, d: number;
    if (dateStr) {
      [y, m, d] = dateStr.split('-').map(Number);
    } else {
      const local = toLocal(new Date(), tz);
      y = local.year;
      m = local.month;
      d = local.day;
    }
    const dayStart = localToUtc(tz, y, m, d, 0, 0);
    const nextDay = localToUtc(tz, y, m, d + 1, 0, 0);
    const waterLogs = await this.logRepo.find({
      where: { userId, category: 'water', scheduledTime: Between(dayStart, nextDay) },
    });
    const waterMl = waterLogs.reduce((sum, l) => sum + l.amount, 0);
    const setting = await this.settingRepo.findOne({ where: { userId } });
    const waterGoalMl = setting?.waterGoalMl ?? 2000;
    return {
      date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      waterMl,
      waterGoalMl,
      rate: Math.min(100, Math.round((waterMl / waterGoalMl) * 100)),
      reached: waterGoalMl > 0 && waterMl >= waterGoalMl,
    };
  }

  /** 手动记录喝水（#4 日期独立；#11 只允许修改今日） */
  async water(userId: string, amountMl: number, dateStr?: string) {
    const tz = await this.getTz(userId);
    if (dateStr) {
      // #11：仅今日可修改（历史与未来日期一律拒绝）
      const local = toLocal(new Date(), tz);
      const todayStr = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
      if (dateStr !== todayStr) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '只能记录今天的水' });
      }
    }
    return this.remindersService.waterLog(userId, amountMl);
  }

  private async getTz(userId: string): Promise<string> {
    return this.remindersService.getUserTimezoneSafe(userId);
  }
}
