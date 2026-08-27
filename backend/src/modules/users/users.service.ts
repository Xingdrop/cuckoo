import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { computeNextTrigger } from '../../common/reminder-schedule';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { Achievement } from '../achievements/achievement.entity';
import { EmergencyContact } from '../contacts/emergency-contact.entity';
import { Device } from '../notifications/device.entity';
import { Notification } from '../notifications/notification.entity';
import { Medicine } from '../medicines/medicine.entity';
import { Post } from '../social/post.entity';
import { Interaction } from '../social/interaction.entity';
import { PlanJoinRecord } from '../social/plan-join-record.entity';
import { Plan } from '../plans/plan.entity';
import { Reminder } from '../reminders/reminder.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { UserSetting } from './user-setting.entity';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly settingRepo: Repository<UserSetting>,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async getMe(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '用户不存在' });
    }
    return this.authService.toPublic(user);
  }

  async updateMe(
    userId: string,
    patch: Partial<Pick<User, 'avatarUrl' | 'healthGoals' | 'timezone'>>,
  ) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '用户不存在' });
    }
    if (patch.avatarUrl !== undefined) user.avatarUrl = patch.avatarUrl;
    if (patch.healthGoals !== undefined) user.healthGoals = patch.healthGoals;
    if (patch.timezone !== undefined) user.timezone = patch.timezone;
    await this.userRepo.save(user);
    return this.authService.toPublic(user);
  }

  async getSettings(userId: string): Promise<UserSetting> {
    let setting = await this.settingRepo.findOne({ where: { userId } });
    if (!setting) {
      setting = await this.settingRepo.save(this.settingRepo.create({ userId }));
    }
    return setting;
  }

  async updateSettings(
    userId: string,
    patch: Partial<UserSetting>,
  ): Promise<UserSetting> {
    // 注意：不能用 save(entity)——TypeORM 1.x 对带 transformer 的列会写入数据库旧值
    await this.settingRepo.update({ userId }, patch);
    return this.getSettings(userId);
  }

  // ============ M5：数据导出 / 注销（FR-105，AC-105/106，IT-06） ============

  /**
   * 游客数据导入合并（#2/#3：游客账户升级）——按"同类数据 created_at 较新优先"合并。
   * 位置：登录后调用；bundle 结构见游客端导出（reminders/logs/medicines/plans/posts）。
   */
  async importData(
    userId: string,
    bundle: {
      reminders?: unknown[];
      logs?: unknown[];
      medicines?: unknown[];
      plans?: unknown[];
      posts?: unknown[];
    },
  ) {
    type Item = Record<string, unknown>;
    const asItems = (arr?: unknown[]): Item[] =>
      (Array.isArray(arr) ? (arr as Item[]) : []).slice(0, 2000);
    const counts: Record<string, { imported: number; skipped: number }> = {};

    /** 按 id+更新时间合并的通用实现：云端较新跳过，本地较新 upsert（updatedAt 优先，回退 createdAt） */
    const mergeRows = async (
      repo: any,
      items: Item[],
      makeEntity: (id: string, raw: Item) => Record<string, unknown>,
    ) => {
      let imported = 0;
      let skipped = 0;
      for (const raw of items) {
        const id = raw.id as string;
        if (!id || typeof id !== 'string') continue;
        const cloud = await repo.findOne({ where: { id }, withDeleted: true });
        const guestAt =
          typeof raw.updatedAt === 'string'
            ? new Date(raw.updatedAt as string).getTime()
            : typeof raw.createdAt === 'string'
              ? new Date(raw.createdAt as string).getTime()
              : 0;
        const cloudAt =
          (cloud && (cloud as { updatedAt?: Date }).updatedAt
            ? new Date((cloud as { updatedAt: Date }).updatedAt).getTime()
            : 0) ||
          (cloud?.createdAt ? new Date(cloud.createdAt).getTime() : 0);
        if (cloud && guestAt <= cloudAt) {
          skipped += 1;
          continue;
        }
        if (cloud) {
          await repo.update({ id }, makeEntity(id, raw));
        } else {
          await repo.save(repo.create(makeEntity(id, raw)));
        }
        imported += 1;
      }
      return { imported, skipped };
    };

    // 提醒
    if (bundle.reminders?.length) {
      const repo = this.dataSource.getRepository(Reminder);
      counts.reminders = await mergeRows(repo as never, asItems(bundle.reminders), (id, raw) => ({
        id,
        userId,
        title: String(raw.title ?? '导入的提醒'),
        category: String(raw.category ?? 'custom'),
        categoryLabel: (raw.categoryLabel as string) ?? null,
        categoryIcon: (raw.categoryIcon as string) ?? null,
        repeatRule: (raw.repeatRule as Reminder['repeatRule']) ?? { type: 'daily' },
        startDate: raw.startDate ? new Date(raw.startDate as string) : new Date(),
        endDate: raw.endDate ? new Date(raw.endDate as string) : null,
        times: (raw.times as string[] | null) ?? null,
        content: (raw.content as Reminder['content']) ?? {},
        medicineId: (raw.medicineId as string) ?? null,
        planId: (raw.planId as string) ?? null,
        isActive: raw.isActive !== false,
        nextTriggerAt: computeNextTrigger(
          (raw.repeatRule as Reminder['repeatRule']) ?? { type: 'daily' },
          new Date(),
          raw.startDate ? new Date(raw.startDate as string) : new Date(),
          raw.endDate ? new Date(raw.endDate as string) : null,
          'Asia/Shanghai',
          (raw.times as string[] | null) ?? null,
        ),
      }));
    }
    // 执行日志
    if (bundle.logs?.length) {
      const repo = this.dataSource.getRepository(ReminderLog);
      counts.logs = await mergeRows(repo as never, asItems(bundle.logs), (id, raw) => ({
        id,
        userId,
        reminderId: (raw.reminderId as string) ?? null,
        scheduledTime: raw.scheduledTime ? new Date(raw.scheduledTime as string) : new Date(),
        actualTime: raw.actualTime ? new Date(raw.actualTime as string) : new Date(),
        status: String(raw.status ?? 'completed'),
        delayMinutes: Number(raw.delayMinutes ?? 0),
        photoUrl: (raw.photoUrl as string) ?? null,
        medicineId: (raw.medicineId as string) ?? null,
        medicineNameSnapshot: (raw.medicineNameSnapshot as string) ?? null,
        category: String(raw.category ?? 'custom'),
        amount: Number(raw.amount ?? 0),
        stockDeducted: Number(raw.stockDeducted ?? 0),
      }));
    }
    // 药品
    if (bundle.medicines?.length) {
      const repo = this.dataSource.getRepository(Medicine);
      counts.medicines = await mergeRows(repo as never, asItems(bundle.medicines), (id, raw) => ({
        id,
        userId,
        name: String(raw.name ?? '导入的药品'),
        dosage: (raw.dosage as string) ?? null,
        stock: Number(raw.stock ?? 0),
        threshold: Number(raw.threshold ?? 0),
        deductionPerUse: Number(raw.deductionPerUse ?? 1),
        notifyOnLowStock: raw.notifyOnLowStock !== false,
        administration: (raw.administration as string) ?? null,
        instructions: (raw.instructions as string) ?? null,
        expiryDate: raw.expiryDate ? new Date(raw.expiryDate as string) : null,
      }));
    }
    // 计划
    if (bundle.plans?.length) {
      const repo = this.dataSource.getRepository(Plan);
      counts.plans = await mergeRows(repo as never, asItems(bundle.plans), (id, raw) => ({
        id,
        userId,
        name: String(raw.name ?? '导入的计划'),
        description: String(raw.description ?? ''),
        sourceType: (raw.sourceType as Plan['sourceType']) ?? 'self',
        sourceTitle: (raw.sourceTitle as string) ?? null,
        sourceId: (raw.sourceId as string) ?? null,
        isActive: raw.isActive !== false,
      }));
    }
    // 帖子
    if (bundle.posts?.length) {
      const repo = this.dataSource.getRepository(Post);
      counts.posts = await mergeRows(repo as never, asItems(bundle.posts), (id, raw) => ({
        id,
        userId,
        type: String(raw.type ?? 'user_plan'),
        content: String(raw.content ?? ''),
        mediaUrls: Array.isArray(raw.mediaUrls) ? (raw.mediaUrls as string[]) : [],
        planSnapshot: (raw.planSnapshot as Record<string, unknown>) ?? null,
      }));
    }
    // 用户设置（#17：离线本地设置合并回流——仅覆盖显式提供的字段）
    if (bundle.settings && typeof bundle.settings === 'object') {
      const s = bundle.settings as Item;
      const fields = [
        'notificationEnabled', 'soundEnabled', 'vibrationEnabled', 'theme',
        'missedThresholdMinutes', 'showSkipButton', 'maxDelayCount',
        'waterGoalMl', 'waterInRate',
      ].filter((k) => s[k] !== undefined) as (keyof UserSetting)[];
      if (fields.length > 0) {
        await this.dataSource.transaction(async (manager) => {
          const repo = manager.getRepository(UserSetting);
          const cloud = await repo.findOne({ where: { userId } });
          const guestAt = typeof s.updatedAt === 'string' ? new Date(s.updatedAt as string).getTime() : 0;
          if (!cloud || guestAt === 0 || guestAt >= new Date(cloud.updatedAt ?? cloud.createdAt ?? 0).getTime()) {
            const patch: Record<string, unknown> = {};
            for (const f of fields) patch[f] = s[f];
            patch.userId = userId;
            await repo.save(repo.create(patch));
          }
        });
        counts.settings = { imported: 1, skipped: 0 };
      }
    }

    void this.audit.record('user.import', userId, { targetType: 'user', targetId: userId, detail: counts });
    return { imported: counts, totalImported: Object.values(counts).reduce((s, c) => s + c.imported, 0) };
  }

  /** 全量数据导出（JSON）：用户资料/设置/提醒/执行记录/药品/帖子/互动/通知/设备/亲友/成就 */
  async exportData(userId: string) {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    const [settings, reminders, reminderLogs, medicines, posts, interactions, notifications, devices, contacts, achievements] =
      await Promise.all([
        this.settingRepo.findOne({ where: { userId } }),
        this.reminderRepo().find({ where: { userId } }),
        this.logRepo().find({ where: { userId } }),
        this.medicineRepo().find({ where: { userId } }),
        this.postRepo().find({ where: { userId } }),
        this.interactionRepo().find({ where: { userId } }),
        this.notifRepo().find({ where: { userId } }),
        this.deviceRepo().find({ where: { userId } }),
        this.contactRepo().find({ where: { userId } }),
        this.achievementRepo().find({ where: { userId } }),
      ]);
    return {
      exportedAt: new Date().toISOString(),
      user: this.authService.toPublic(user),
      settings: settings ?? null,
      reminders,
      reminderLogs,
      medicines,
      posts,
      interactions,
      notifications,
      devices,
      emergencyContacts: contacts,
      achievements,
    };
  }

  /**
   * 注销账号（演示口径：软删除用户 + 立即物理清理业务数据，审计留存）。
   * 软删除后：JWT 校验（jwt.strategy）与登录（findOne 默认过滤）均失效。
   */
  async deleteAccount(userId: string) {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Reminder).softDelete({ userId });
      await manager.getRepository(ReminderLog).delete({ userId });
      await manager.getRepository(Medicine).softDelete({ userId });
      await manager.getRepository(Post).softDelete({ userId });
      await manager.getRepository(Interaction).delete({ userId });
      await manager.getRepository(PlanJoinRecord).delete({ userId });
      await manager.getRepository(Notification).delete({ userId });
      await manager.getRepository(Device).delete({ userId });
      await manager.getRepository(EmergencyContact).delete({ userId });
      await manager.getRepository(Achievement).delete({ userId });
      await manager.getRepository(UserSetting).delete({ userId });
      await manager.getRepository(User).softDelete({ id: userId });
    });
    void this.audit.record('user.delete', userId, { detail: { scope: 'hard-clean' } });
    return { success: true };
  }

  // repo 快捷获取（避免构造器爆长；均不带默认过滤之外的上下文）
  private reminderRepo() { return this.dataSource.getRepository(Reminder); }
  private logRepo() { return this.dataSource.getRepository(ReminderLog); }
  private medicineRepo() { return this.dataSource.getRepository(Medicine); }
  private postRepo() { return this.dataSource.getRepository(Post); }
  private interactionRepo() { return this.dataSource.getRepository(Interaction); }
  private notifRepo() { return this.dataSource.getRepository(Notification); }
  private deviceRepo() { return this.dataSource.getRepository(Device); }
  private contactRepo() { return this.dataSource.getRepository(EmergencyContact); }
  private achievementRepo() { return this.dataSource.getRepository(Achievement); }
}
