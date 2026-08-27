import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { Plan, PlanSourceType } from './plan.entity';
import { Reminder } from '../reminders/reminder.entity';
import { computeNextTrigger } from '../../common/reminder-schedule';

type PlanReminderConfig = Record<string, unknown> & {
  category?: string;
  title?: string;
  repeatRule?: unknown;
  times?: string[] | null;
  startTime?: string;
  content?: Record<string, unknown>;
  reminderId?: string | null;
};

/**
 * 我的计划（2026-08：#18 加入=保存计划不建提醒）：
 * - 自建计划 CRUD / 启停 / 一键发帖
 * - 一键加入（帖子/官方计划）只保存计划 + 提醒配置（isActive=false），
 *   用户在我的计划中开启开关 → 按配置（重新）创建提醒；关闭 → 清除全部相关提醒
 * - 删除计划内（部分/全部）提醒 → 计划开关自动关闭（配置保留，可再次启用重建）
 */
@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    @InjectRepository(Reminder)
    private readonly reminderRepo: Repository<Reminder>,
  ) {}

  /** 创建自建计划 */
  async create(userId: string, dto: { name: string; description?: string }) {
    if (!dto.name?.trim()) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '请输入计划名称' });
    }
    return this.planRepo.save(
      this.planRepo.create({
        id: randomUUID(),
        userId,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? '',
        sourceType: 'self',
        sourceTitle: null,
        sourceId: null,
        isActive: true,
        config: null,
      }),
    );
  }

  /** 我的计划列表（附带提醒数 / 配置数） */
  async list(userId: string) {
    const plans = await this.planRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    const ids = plans.map((p) => p.id);
    const counts = ids.length
      ? await this.reminderRepo
          .createQueryBuilder('r')
          .select('r.planId', 'planId')
          .addSelect('COUNT(*)', 'cnt')
          .where('r.userId = :userId AND r.planId IN (:...ids)', { userId, ids })
          .groupBy('r.planId')
          .getRawMany<{ planId: string; cnt: string }>()
      : [];
    const countMap = new Map(counts.map((c) => [c.planId, Number(c.cnt)]));
    return plans.map((p) => ({
      ...p,
      reminderCount: countMap.get(p.id) ?? 0,
      configCount: (p.config ?? []).length,
    }));
  }

  async findOne(userId: string, id: string) {
    const plan = await this.planRepo.findOne({ where: { id, userId } });
    if (!plan) throw new NotFoundException({ code: 'NOT_FOUND', message: '计划不存在' });
    return plan;
  }

  /** 关闭计划：清除全部相关提醒（配置保留——可再次启用重建） */
  private async deactivatePlan(userId: string, planId: string) {
    await this.reminderRepo.softDelete({ userId, planId });
  }

  /** 开启计划：按配置重建缺失提醒（保留已存在的），并全部启用 */
  private async activatePlan(userId: string, plan: Plan) {
    const configs = (plan.config ?? []) as PlanReminderConfig[];
    const cfg: PlanReminderConfig[] = [];
    for (const entry of configs) {
      let existing: Reminder | null = null;
      if (entry.reminderId) {
        existing = await this.reminderRepo.findOne({
          where: { id: entry.reminderId, userId },
          withDeleted: true,
        });
      }
      if (existing && !existing.deletedAt) {
        if (!existing.isActive) {
          await this.reminderRepo.update({ id: existing.id, userId }, { isActive: true });
        }
        cfg.push({ ...entry, reminderId: existing.id });
        continue;
      }
      const created = await this.reminderRepo.save(this.buildFromConfig(userId, plan.id, entry));
      cfg.push({ ...entry, reminderId: created.id });
    }
    await this.planRepo.update({ id: plan.id, userId }, { config: cfg as never });
  }

  /** 按配置创建提醒（与一键加入的字段解析一致） */
  private buildFromConfig(userId: string, planId: string, c: PlanReminderConfig): Partial<Reminder> {
    const now = new Date();
    const startDate = new Date(now);
    const times = Array.isArray(c.times) ? (c.times as string[]) : c.startTime ? [c.startTime] : null;
    if (c.startTime && !times?.length) {
      const [h, m] = (c.startTime as string).split(':').map(Number);
      startDate.setHours(h, m, 0, 0);
    }
    const repeatRule = (c.repeatRule as Reminder['repeatRule']) ?? { type: 'daily' };
    return this.reminderRepo.create({
      id: randomUUID(),
      userId,
      category: (c.category as Reminder['category']) ?? 'custom',
      title: c.title ?? '加入的计划',
      repeatRule,
      startDate,
      times,
      content: c.content ?? {},
      method: {},
      delaySettings: {},
      challenge: {},
      medicineId: null,
      planId,
      isActive: true,
      modifiedFromPlan: false,
      nextTriggerAt: computeNextTrigger(repeatRule, now, startDate, null, 'Asia/Shanghai', times),
    });
  }

  /** 启停（#18：关闭=清除提醒，开启=按配置重建） */
  async setActive(userId: string, id: string, isActive: boolean) {
    const plan = await this.findOne(userId, id);
    if (plan.isActive !== isActive) {
      if (isActive) await this.activatePlan(userId, plan);
      else await this.deactivatePlan(userId, id);
      await this.planRepo.update({ id, userId }, { isActive });
    }
    return this.findOne(userId, id);
  }

  /** 更新计划（名称/描述/启停，只更新传入字段；启停走 setActive 语义） */
  async patch(
    userId: string,
    id: string,
    patch: Partial<Pick<Plan, 'name' | 'description' | 'isActive'>>,
  ) {
    if (patch.isActive !== undefined) {
      await this.setActive(userId, id, patch.isActive);
    }
    const update: { name?: string; description?: string } = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.description !== undefined) update.description = patch.description;
    if (Object.keys(update).length) {
      await this.planRepo.update({ id, userId }, update);
    }
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    // #18：删除计划 = 一并清除其全部相关提醒（含配置快照）
    await this.reminderRepo.softDelete({ userId, planId: id });
    await this.planRepo.delete({ id, userId });
    return { success: true };
  }

  /**
   * 一键加入/官方计划加入时落库计划（同来源复用；sourceTitle 描述来源）。
   * #18：不创建提醒——计划以 isActive=false + config（提醒配置）落库，由用户在计划页开启。
   */
  async ensureFromJoin(
    userId: string,
    source: { type: PlanSourceType; sourceId: string; sourceTitle: string },
    config: PlanReminderConfig[] = [],
  ): Promise<Plan> {
    const existing = await this.planRepo.findOne({
      where: { userId, sourceType: source.type, sourceId: source.sourceId },
    });
    if (existing) {
      if (!existing.config && config.length) {
        await this.planRepo.update({ id: existing.id, userId }, { config: config as never });
      }
      return existing;
    }
    return this.planRepo.save(
      this.planRepo.create({
        id: randomUUID(),
        userId,
        name: source.sourceTitle,
        description: '',
        sourceType: source.type,
        sourceTitle: source.sourceTitle,
        sourceId: source.sourceId,
        isActive: false,
        config: config.length ? (config as never) : null,
      }),
    );
  }

  /** planId → name 映射（提醒列表/看板展示"来自 xx 计划"） */
  async nameMap(planIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(planIds.filter(Boolean))];
    if (!ids.length) return new Map();
    const plans = await this.planRepo.find({ where: { id: In(ids) }, select: { id: true, name: true } });
    return new Map(plans.map((p) => [p.id, p.name]));
  }

  /** 计划内提醒 → 帖子计划快照（reminders[] 与 social.joinPlan 解析格式一致） */
  async buildSnapshot(userId: string, planId: string) {
    const plan = await this.findOne(userId, planId);
    const reminders = await this.reminderRepo.find({ where: { userId, planId, isActive: true } });
    return {
      version: 1,
      from: { name: plan.name },
      reminders: reminders.map((r) => ({
        category: r.category,
        categoryLabel: r.categoryLabel,
        title: r.title,
        repeatRule: r.repeatRule,
        times: r.times ?? undefined,
        startDate: r.startDate,
        content: r.content,
      })),
    };
  }
}
