import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
