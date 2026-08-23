import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { Plan, PlanSourceType } from './plan.entity';
import { Reminder } from '../reminders/reminder.entity';

/**
 * 我的计划（2026-08）：
 * - 自建计划 CRUD / 启停 / 一键发帖（把计划内提醒导出为帖子快照）
 * - 一键加入（帖子/官方计划）时由 SocialService 调 ensureFromJoin 自动落库
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
      }),
    );
  }

  /** 我的计划列表（附带提醒数） */
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
    return plans.map((p) => ({ ...p, reminderCount: countMap.get(p.id) ?? 0 }));
  }

  async findOne(userId: string, id: string) {
    const plan = await this.planRepo.findOne({ where: { id, userId } });
    if (!plan) throw new NotFoundException({ code: 'NOT_FOUND', message: '计划不存在' });
    return plan;
  }

  /** 启停（isActive=false 时关联提醒在提醒列表置灰且不触发调度——前端展示 + scheduler 过滤） */
  async setActive(userId: string, id: string, isActive: boolean) {
    await this.findOne(userId, id);
    await this.planRepo.update({ id, userId }, { isActive });
    return this.findOne(userId, id);
  }

  /** 更新计划（名称/描述/启停，只更新传入字段） */
  async patch(
    userId: string,
    id: string,
    patch: Partial<Pick<Plan, 'name' | 'description' | 'isActive'>>,
  ) {
    await this.findOne(userId, id);
    await this.planRepo.update({ id, userId }, patch);
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    const reminderIds = await this.reminderRepo.find({ where: { userId, planId: id }, select: { id: true } });
    if (reminderIds.length) {
      await this.reminderRepo.update({ userId, planId: id }, { planId: null });
    }
    await this.planRepo.delete({ id, userId });
    return { success: true };
  }

  /**
   * 一键加入/官方计划加入时落库计划（同来源复用；sourceTitle 描述来源）。
   * 调用方随后把新提醒的 planId 写入。
   */
  async ensureFromJoin(
    userId: string,
    source: { type: PlanSourceType; sourceId: string; sourceTitle: string },
  ): Promise<Plan> {
    const existing = await this.planRepo.findOne({
      where: { userId, sourceType: source.type, sourceId: source.sourceId },
    });
    if (existing) return existing;
    return this.planRepo.save(
      this.planRepo.create({
        id: randomUUID(),
        userId,
        name: source.sourceTitle,
        description: '',
        sourceType: source.type,
        sourceTitle: source.sourceTitle,
        sourceId: source.sourceId,
        isActive: true,
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
