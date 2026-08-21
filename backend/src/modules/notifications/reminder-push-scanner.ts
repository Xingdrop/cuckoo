import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Between, In, Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { Reminder } from '../reminders/reminder.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { UserSetting } from '../users/user-setting.entity';
import { NotificationLog, NotificationChannel, NotificationStatus } from './notification-log.entity';
import { PushService } from './push.service';

/** 到期推送窗口：只对「最近 10 分钟内到期且未响应」的提醒补推（更早的交给漏服扫描） */
const PUSH_WINDOW_MS = 10 * 60_000;

/**
 * 提醒到期推送（通道 B 兜底，FR-210）：每分钟扫描到期未响应的提醒 → Web Push。
 * - 与本地通道不重复打扰：该时刻已有 ReminderLog（完成/延迟/跳过）→ 跳过
 * - 幂等：NotificationLog.dedupKey = `push:reminder:{id}:{scheduledAt}`（先写后发，防重复推送）
 * - VAPID 未配置（sendToUser 返回 skipped）→ 删除占位记录，待配置后自动重试
 * - 用户关闭通知（UserSetting.notificationEnabled=false）→ 不推送（AC-104）
 */
@Injectable()
export class ReminderPushScanner {
  private readonly logger = new Logger(ReminderPushScanner.name);

  constructor(
    @InjectRepository(Reminder)
    private readonly reminderRepo: Repository<Reminder>,
    @InjectRepository(ReminderLog)
    private readonly logRepo: Repository<ReminderLog>,
    @InjectRepository(NotificationLog)
    private readonly notifLogRepo: Repository<NotificationLog>,
    @InjectRepository(UserSetting)
    private readonly settingRepo: Repository<UserSetting>,
    private readonly push: PushService,
  ) {}

  @Interval('reminder-push-scan', 60_000)
  async scan() {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - PUSH_WINDOW_MS);
      const due = await this.reminderRepo.find({
        where: { isActive: true, nextTriggerAt: Between(windowStart, now) },
      });
      if (due.length === 0) return;

      // 关闭通知的用户集合（批量查一次）
      const userIds = [...new Set(due.map((r) => r.userId))];
      const disabled = await this.settingRepo.find({
        where: { notificationEnabled: false, userId: In(userIds) },
      });
      const disabledSet = new Set(disabled.map((s) => s.userId));

      for (const reminder of due) {
        if (disabledSet.has(reminder.userId)) continue;
        const scheduled = reminder.nextTriggerAt!;

        // 已由本地通道响应（完成/延迟/跳过）→ 不再推送
        const responded = await this.logRepo.findOne({
          where: { reminderId: reminder.id, scheduledTime: scheduled },
        });
        if (responded) continue;

        // 幂等去重（先写占位记录，避免并发重复推送）
        const dedupKey = `push:reminder:${reminder.id}:${scheduled.getTime()}`;
        const existing = await this.notifLogRepo.findOne({ where: { dedupKey } });
        if (existing) continue;

        await this.notifLogRepo.save(
          this.notifLogRepo.create({
            id: randomUUID(),
            userId: reminder.userId,
            recipientType: 'user',
            recipient: null,
            channel: NotificationChannel.PUSH,
            dedupKey,
            status: NotificationStatus.SENT,
          }),
        );

        const result = await this.push.sendToUser(reminder.userId, {
          title: '提醒时间到',
          body: `「${reminder.title}」现在开始`,
          url: '/today',
        });
        if (result.skipped) {
          // VAPID 未配置：删除占位记录，配置后会重新尝试
          await this.notifLogRepo.delete({ dedupKey });
          this.logger.log(`到期推送跳过（VAPID 未配置）: ${reminder.title}`);
        }
      }
    } catch (err) {
      this.logger.error(`到期推送扫描异常: ${String(err)}`);
    }
  }
}
