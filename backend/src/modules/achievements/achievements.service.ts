/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9hY2hpZXZlbWVudHMvYWNoaWV2ZW1lbnRzLnNlcnZpY2UudHN8MjAyNi0wOXxiODAwNzIzYjli */ */
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { localToUtc, toLocal } from '../../common/reminder-schedule';
import { Achievement, AchievementRule, AchievementType } from './achievement.entity';
import { metricFor, Metrics, pendingAchievements } from './achievement-rules';
import { ReminderLog, ReminderLogStatus } from '../reminders/reminder-log.entity';
import { RemindersService } from '../reminders/reminders.service';
import { Notification, NotificationType } from '../notifications/notification.entity';
import { PushService } from '../notifications/push.service';

const DONE_STATUSES = [
  ReminderLogStatus.COMPLETED,
  ReminderLogStatus.CHALLENGE_COMPLETED,
];

/** 内置成就规则（需求 §6.6；运营可扩展，规则表驱动） */
const BUILTIN_RULES: Array<Omit<AchievementRule, 'sortOrder'> & { sortOrder: number }> = [
  { type: 'streak_7', name: '七日坚持', description: '连续 7 天全部完成', icon: '🔥', threshold: 7, unit: '天', sortOrder: 1 },
  { type: 'streak_30', name: '月度铁人', description: '连续 30 天全部完成', icon: '🏆', threshold: 30, unit: '天', sortOrder: 2 },
  { type: 'streak_100', name: '百日筑基', description: '连续 100 天全部完成', icon: '💯', threshold: 100, unit: '天', sortOrder: 3 },
  { type: 'streak_365', name: '年度之王', description: '连续 365 天全部完成', icon: '👑', threshold: 365, unit: '天', sortOrder: 4 },
  { type: 'medication_100', name: '用药达人', description: '累计完成用药提醒 100 次', icon: '💊', threshold: 100, unit: '次', sortOrder: 5 },
  { type: 'exercise_50', name: '锻炼标兵', description: '累计完成锻炼提醒 50 次', icon: '🏃', threshold: 50, unit: '次', sortOrder: 6 },
  { type: 'water_200', name: '喝水高手', description: '累计完成喝水提醒 200 次', icon: '💧', threshold: 200, unit: '次', sortOrder: 7 },
];

/**
 * 成就系统（FR-708）：规则表驱动。
 * - check(userId)：计算指标（连续天数/分类累计）→ 匹配未达成规则 → 入表（UNIQUE 幂等）+ 通知 + 推送
 * - 触发点：提醒 ack 后由 RemindersService 调用（fire-and-forget）
 */
@Injectable()
export class AchievementsService {
  private readonly logger = new Logger(AchievementsService.name);
  private ensureStarted = false;

  constructor(
    @InjectRepository(Achievement)
    private readonly achievementRepo: Repository<Achievement>,
    @InjectRepository(AchievementRule)
    private readonly ruleRepo: Repository<AchievementRule>,
    @InjectRepository(ReminderLog)
    private readonly logRepo: Repository<ReminderLog>,
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    private readonly push: PushService,
    @Inject(forwardRef(() => RemindersService))
    private readonly remindersService: RemindersService,
  ) {}

  /** 启动时确保内置规则存在（幂等；运营可直接改库维护） */
  async ensureRules() {
    if (this.ensureStarted) return;
    for (const r of BUILTIN_RULES) {
      const exists = await this.ruleRepo.findOne({ where: { type: r.type } });
      if (!exists) {
        await this.ruleRepo.save(this.ruleRepo.create(r));
      }
    }
    this.ensureStarted = true;
  }

  /** 检查并解锁新成就（幂等：同一成就只入表一次） */
  async check(userId: string): Promise<Achievement[]> {
    await this.ensureRules();
    const metrics = await this.computeMetrics(userId);
    const achievedRows = await this.achievementRepo.find({ where: { userId } });
    const achievedTypes = new Set(achievedRows.map((a) => a.type));
    const toUnlock = pendingAchievements(
      await this.ruleRepo.find({ order: { sortOrder: 'ASC' } }),
      metrics,
      achievedTypes,
    );

    const unlocked: Achievement[] = [];
    for (const rule of toUnlock) {
      const row = await this.achievementRepo.save(
        this.achievementRepo.create({ id: randomUUID(), userId, type: rule.type }),
      );
      unlocked.push(row);
      await this.notifRepo.save(
        this.notifRepo.create({
          id: randomUUID(),
          userId,
          type: NotificationType.ACHIEVEMENT,
          title: `成就解锁：${rule.name} ${rule.icon}`,
          content: rule.description,
          linkUrl: '/achievements',
        }),
      );
      await this.push.sendToUser(userId, {
        title: `成就解锁：${rule.name} ${rule.icon}`,
        body: rule.description,
        url: '/achievements',
      });
      this.logger.log(`成就解锁 user=${userId} type=${rule.type}`);
    }
    return unlocked;
  }

  /** 成就墙（FR-708）：已达成 + 全部规则与进度 */
  async wall(userId: string) {
    await this.ensureRules();
    const metrics = await this.computeMetrics(userId);
    const achievedRows = await this.achievementRepo.find({
      where: { userId },
      order: { achievedAt: 'ASC' },
    });
    const rules = await this.ruleRepo.find({ order: { sortOrder: 'ASC' } });

    const achievedMap = new Map(achievedRows.map((a) => [a.type, a]));
    const rulesView = rules.map((r) => {
      const current = metricFor(r.type, metrics);
      return {
        type: r.type,
        name: r.name,
        description: r.description,
        icon: r.icon,
        threshold: r.threshold,
        unit: r.unit,
        current: Math.min(current, r.threshold),
        achieved: achievedMap.has(r.type),
        achievedAt: achievedMap.get(r.type)?.achievedAt ?? null,
      };
    });

    return {
      metrics: {
        streakDays: metrics.streakDays,
        medicationCount: metrics.medicationCount,
        exerciseCount: metrics.exerciseCount,
        waterCount: metrics.waterCount,
      },
      rules: rulesView,
      unlockedCount: achievedRows.length,
    };
  }

  private async computeMetrics(userId: string): Promise<Metrics> {
    const tz = await this.remindersService.getUserTimezoneSafe(userId);
    const local = toLocal(new Date(), tz);
    const todayStr = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
    const streakDays = await this.calcStreak(userId, todayStr, tz);
    const count = async (category: string) =>
      this.logRepo.count({ where: { userId, category, status: In(DONE_STATUSES) } });
    return {
      streakDays,
      medicationCount: await count('medication'),
      exerciseCount: await count('exercise'),
      waterCount: await count('water'),
    };
  }

  /**
   * 连续天数（与 StatsService.calcStreak 同口径：每天全部完成才计入，中断即停）。
   * 独立实现以规避 Reminders → Achievements → Stats → Reminders 模块环。
   */
  private async calcStreak(userId: string, todayStr: string, tz: string): Promise<number> {
    const [y, m, d] = todayStr.split('-').map(Number);
    const today = await this.dayRate(userId, todayStr, tz);
    let cursor =
      today.planned > 0 && today.done >= today.planned ? todayStr : null;
    let offset = 0;
    let streak = 0;
    while (offset < 365) {
      const date = cursor
        ? localToUtc(tz, y, m, d - offset, 0, 0)
        : localToUtc(tz, y, m, d - 1 - offset, 0, 0);
      const l = toLocal(date, tz);
      const key = `${l.year}-${String(l.month).padStart(2, '0')}-${String(l.day).padStart(2, '0')}`;
      const rate = await this.dayRate(userId, key, tz);
      if (rate.planned > 0 && rate.done >= rate.planned) {
        streak += 1;
      } else if (rate.planned > 0) {
        break;
      }
      offset += 1;
    }
    return streak;
  }

  private async dayRate(userId: string, dateStr: string, tz: string) {
    const plan = await this.remindersService.dayPlan(userId, dateStr);
    let planned = 0;
    let done = 0;
    for (const item of plan) {
      for (const t of item.times) {
        if (t.status !== 'skipped') planned += 1;
        if (t.status === 'completed' || t.status === 'challenge_completed') done += 1;
      }
    }
    return { planned, done };
  }
}
