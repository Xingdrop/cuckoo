/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9yZXBvcnRzL3JlcG9ydHMuc2VydmljZS50c3wyMDI2LTA5fDQwOTkxMTc1ZmU= */
import { Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { localToUtc, toLocal } from '../../common/reminder-schedule';
import { AuditService } from '../audit/audit.service';
import { Notification, NotificationType } from '../notifications/notification.entity';
import { PushService } from '../notifications/push.service';
import { RemindersService } from '../reminders/reminders.service';
import { StatsService } from '../stats/stats.service';
import { User } from '../users/user.entity';
import { Report, ReportType } from './report.entity';
import { aggregatePlans, buildSuggestion, PlanItem } from './report-stats';

/**
 * 周报/月报（FR-704/705）：
 * - 定时任务（WEEKLY_REPORT_CRON / MONTHLY_REPORT_CRON，默认周一/1 日 08:00）生成快照 → 写通知 → 可点击跳转报告页
 * - 聚合口径复用 dayPlan（完成率 = done/planned，skip 不计分母）
 * - POST /reports/generate 供开发/验收手动触发（AC-601）
 */
@Injectable()
export class ReportsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly remindersService: RemindersService,
    private readonly statsService: StatsService,
    private readonly push: PushService,
    private readonly audit: AuditService,
    private readonly scheduler: SchedulerRegistry,
    private readonly config: ConfigService,
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /** 启动时注册 cron（表达式来自配置：WEEKLY_REPORT_CRON / MONTHLY_REPORT_CRON） */
  onApplicationBootstrap() {
    const weeklyExpr = this.config.get<string>('jobs.weeklyReportCron') ?? '0 8 * * 1';
    const monthlyExpr = this.config.get<string>('jobs.monthlyReportCron') ?? '0 8 1 * *';
    const tz = 'Asia/Shanghai';
    try {
      this.scheduler.addCronJob(
        'weekly-report',
        CronJob.from({ cronTime: weeklyExpr, onTick: () => void this.generateForAll(ReportType.WEEKLY), start: true, timeZone: tz }),
      );
      this.scheduler.addCronJob(
        'monthly-report',
        CronJob.from({ cronTime: monthlyExpr, onTick: () => void this.generateForAll(ReportType.MONTHLY), start: true, timeZone: tz }),
      );
      this.logger.log(`报告 cron 已注册: weekly[${weeklyExpr}] monthly[${monthlyExpr}] (${tz})`);
    } catch (err) {
      this.logger.error(`报告 cron 注册失败: ${String(err)}`);
    }
  }

  /** 为所有用户生成（定时任务用；单用户失败不影响其他） */
  async generateForAll(type: ReportType) {
    const users = await this.userRepo.find({ select: { id: true } });
    for (const u of users) {
      try {
        await this.generate(u.id, type);
      } catch (err) {
        this.logger.warn(`生成报告失败 user=${u.id}: ${String(err)}`);
      }
    }
    this.logger.log(`报告生成完成 type=${type} users=${users.length}`);
  }

  /** 生成当前周期报告（幂等：同周期存在则覆盖 data，不重复通知） */
  async generate(userId: string, type: ReportType): Promise<Report> {
    const tz = await this.remindersService.getUserTimezoneSafe(userId);
    const data =
      type === ReportType.WEEKLY
        ? await this.buildWeekly(userId, tz)
        : await this.buildMonthly(userId, tz);

    const existing = await this.reportRepo.findOne({ where: { userId, type, period: data.period as string } });
    if (existing) {
      // TS7 conditional 类型对 simple-json update 推断异常，as never 绕过（值本身类型正确）
      await this.reportRepo.update({ id: existing.id }, { data } as never);
      return this.reportRepo.findOneOrFail({ where: { id: existing.id } });
    }

    const report = await this.reportRepo.save(
      this.reportRepo.create({
        id: randomUUID(),
        userId,
        type,
        period: data.period as string,
        data,
      }),
    );

    const title = type === ReportType.WEEKLY ? '本周周报已生成' : '本月月报已生成';
    const linkUrl = `/reports/${report.id}`;
    await this.notifRepo.save(
      this.notifRepo.create({
        id: randomUUID(),
        userId,
        type: type === ReportType.WEEKLY ? NotificationType.WEEKLY_REPORT : NotificationType.MONTHLY_REPORT,
        title,
        content: `查看${type === ReportType.WEEKLY ? '本周' : '本月'}表现：完成率 ${data.overallRate}%，坚持 ${data.streakDays} 天`,
        linkUrl,
      }),
    );
    await this.push.sendToUser(userId, { title, body: `完成率 ${data.overallRate}%，坚持 ${data.streakDays} 天`, url: linkUrl });
    void this.audit.record('report.generate', userId, { targetType: 'report', targetId: report.id, detail: { type } });
    return report;
  }

  // ============ 周报 ============

  private async buildWeekly(userId: string, tz: string) {
    const now = toLocal(new Date(), tz);
    const todayLocal = new Date(Date.UTC(now.year, now.month - 1, now.day));
    // 周一为一周起点
    const weekday0 = (todayLocal.getUTCDay() + 6) % 7;
    const mondayUtc = new Date(todayLocal.getTime() - weekday0 * 86_400_000);

    const [startStr, endStr] = this.rangeStr(mondayUtc, 7, tz);
    const [prevStartStr, prevEndStr] = this.rangeStr(new Date(mondayUtc.getTime() - 7 * 86_400_000), 7, tz);

    const current = aggregatePlans(await this.collectPlans(userId, startStr, endStr, tz));
    const previous = aggregatePlans(await this.collectPlans(userId, prevStartStr, prevEndStr, tz));

    const bestCategory = current.categoryStats.find((c) => c.done > 0)?.name ?? null;
    const bestReminder = current.byReminder[0] ?? null;
    const todayStr = `${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`;
    const streakDays = await this.statsService.calcStreak(userId, todayStr);

    return {
      type: 'weekly',
      period: this.weekKey(todayLocal),
      range: { start: startStr, end: endStr },
      overall: this.overall(current),
      prevOverall: this.overall(previous),
      prevRate: previous.rate,
      rateDelta: current.rate - previous.rate,
      categoryStats: current.categoryStats,
      bestCategory,
      bestReminder,
      streakDays,
      suggestion: buildSuggestion(current.rate, previous.rate, bestCategory),
      overallRate: current.rate,
    } as Record<string, unknown>;
  }

  // ============ 月报 ============

  private async buildMonthly(userId: string, tz: string) {
    const now = toLocal(new Date(), tz);
    const y = now.year;
    const m = now.month;
    const monthStr = `${y}-${String(m).padStart(2, '0')}`;

    const dayRateList = await this.statsService.heatmap(userId, monthStr);
    const monthPlans: PlanItem[] = [];
    for (let d = 1; d <= dayRateList.length; d += 1) {
      const key = `${monthStr}-${String(d).padStart(2, '0')}`;
      monthPlans.push(...(await this.remindersService.dayPlan(userId, key)));
    }
    const totals = aggregatePlans(monthPlans);
    const bestCategory = totals.categoryStats.find((c) => c.done > 0)?.name ?? null;

    const todayStr = `${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`;
    const streakDays = await this.statsService.calcStreak(userId, todayStr);

    return {
      type: 'monthly',
      period: monthStr,
      heatmap: dayRateList,
      overall: this.overall(totals),
      categoryStats: totals.categoryStats,
      bestCategory,
      streakDays,
      achievements: [], // M5-C 成就系统完成后回填
      suggestion: buildSuggestion(totals.rate, null, bestCategory),
      overallRate: totals.rate,
    } as Record<string, unknown>;
  }

  // ============ 工具 ============

  private overall(s: ReturnType<typeof aggregatePlans>) {
    return {
      planned: s.planned,
      done: s.done,
      skipped: s.skipped,
      missed: s.missed,
      rate: s.rate,
    };
  }

  /** [startStr, endExclusiveStr]（本地日期字符串，长度 days 天） */
  private rangeStr(mondayUtc: Date, days: number, tz: string): [string, string] {
    const start = toLocal(mondayUtc, tz);
    const end = toLocal(new Date(mondayUtc.getTime() + days * 86_400_000), tz);
    const fmt = (l: { year: number; month: number; day: number }) =>
      `${l.year}-${String(l.month).padStart(2, '0')}-${String(l.day).padStart(2, '0')}`;
    return [fmt(start), fmt(end)];
  }

  /** ISO 周键：2026-08-17（周一）→ 2026-W35 */
  private weekKey(mondayUtc: Date): string {
    const thursday = new Date(mondayUtc.getTime() + 3 * 86_400_000);
    const y = thursday.getUTCFullYear();
    const jan1 = new Date(Date.UTC(y, 0, 1));
    const week = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
    return `${y}-W${String(week).padStart(2, '0')}`;
  }

  /** 收集 [startStr, endExclusiveStr) 的 dayPlan（按本地日期逐日展开） */
  private async collectPlans(userId: string, startStr: string, endExclusiveStr: string, tz: string): Promise<PlanItem[]> {
    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endExclusiveStr.split('-').map(Number);
    const startUtc = localToUtc(tz, sy, sm, sd, 0, 0);
    const endUtc = localToUtc(tz, ey, em, ed, 0, 0);
    const plans: PlanItem[] = [];
    for (let t = startUtc.getTime(); t < endUtc.getTime(); t += 86_400_000) {
      const l = toLocal(new Date(t), tz);
      const key = `${l.year}-${String(l.month).padStart(2, '0')}-${String(l.day).padStart(2, '0')}`;
      plans.push(...(await this.remindersService.dayPlan(userId, key)));
    }
    return plans;
  }

  // ============ 查询 API ============

  async list(userId: string, page = 1, pageSize = 20) {
    const [items, total] = await this.reportRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: Math.min(pageSize, 100),
    });
    return { items, total, page, pageSize };
  }

  async findOne(userId: string, id: string) {
    const report = await this.reportRepo.findOne({ where: { id, userId } });
    if (!report) throw new NotFoundException({ code: 'NOT_FOUND', message: '报告不存在' });
    return report;
  }
}
