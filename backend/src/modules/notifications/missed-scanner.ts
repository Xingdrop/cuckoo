/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9ub3RpZmljYXRpb25zL21pc3NlZC1zY2FubmVyLnRzfDIwMjYtMDl8NjM4N2Y1MTQ1OA== */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, LessThan, Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { ReminderLog, ReminderLogStatus } from '../reminders/reminder-log.entity';
import { Reminder } from '../reminders/reminder.entity';
import { EmergencyContact } from '../contacts/emergency-contact.entity';
import { UserSetting } from '../users/user-setting.entity';
import { Notification, NotificationType } from './notification.entity';
import { NotificationLog, NotificationChannel, NotificationStatus } from './notification-log.entity';
import { PushService } from './push.service';

const DEFAULT_MISSED_THRESHOLD_MINUTES = 30;

/**
 * 漏服扫描（FR-307）：每分钟扫描超时未响应的提醒 → 置 missed → 通知本人（含 Push）+ 亲友。
 * 服务端权威判定（页面关闭也生效）；阈值取用户级 UserSetting.missedThresholdMinutes（默认 30）。
 */
@Injectable()
export class MissedScanner {
  private readonly logger = new Logger(MissedScanner.name);

  constructor(
    @InjectRepository(Reminder)
    private readonly reminderRepo: Repository<Reminder>,
    @InjectRepository(ReminderLog)
    private readonly logRepo: Repository<ReminderLog>,
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    @InjectRepository(NotificationLog)
    private readonly notifLogRepo: Repository<NotificationLog>,
    @InjectRepository(EmergencyContact)
    private readonly contactRepo: Repository<EmergencyContact>,
    @InjectRepository(UserSetting)
    private readonly settingRepo: Repository<UserSetting>,
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {}

  @Interval('missed-scan', 60_000)
  async scan() {
    try {
      const now = new Date();
      // 超时判定：nextTriggerAt 已过 + 该时刻无任何响应记录（completed/delayed/skipped 都不算漏服）
      const overdue = await this.reminderRepo.find({
        where: {
          isActive: true,
          nextTriggerAt: LessThan(now),
        },
      });

      // 用户级漏服阈值（批量加载一次，避免 N+1）
      const userIds = [...new Set(overdue.map((r) => r.userId))];
      const settings = await this.settingRepo.find({ where: { userId: In(userIds) } });
      const thresholdByUser = new Map(
        settings.map((s) => [s.userId, s.missedThresholdMinutes ?? DEFAULT_MISSED_THRESHOLD_MINUTES]),
      );

      // 不定时提醒（无 times 且非按小时 interval）：没有固定触发时刻，不做漏服判定（#12）
      for (const reminder of overdue.filter(
        (r) =>
          (r.times !== null && r.times.length > 0) ||
          (r.repeatRule.type === 'interval' && r.repeatRule.intervalUnit === 'hour'),
      )) {
        const next = reminder.nextTriggerAt!;
        const responded = await this.logRepo.findOne({
          where: { reminderId: reminder.id, scheduledTime: next },
        });
        if (responded) continue; // 已有响应（完成/延迟/跳过），不判定

        // 阈值检查（用户级 missedThresholdMinutes，默认 30 分钟）
        const thresholdMs =
          (thresholdByUser.get(reminder.userId) ?? DEFAULT_MISSED_THRESHOLD_MINUTES) * 60_000;
        if (now.getTime() - next.getTime() < thresholdMs) continue;

        // 置 missed + 写日志（幂等：同 reminder+scheduledTime）
        const existing = await this.logRepo.findOne({
          where: { reminderId: reminder.id, scheduledTime: next },
        });
        if (existing) continue;

        await this.logRepo.save(
          this.logRepo.create({
            id: randomUUID(),
            reminderId: reminder.id,
            userId: reminder.userId,
            scheduledTime: next,
            actualTime: now,
            status: ReminderLogStatus.MISSED,
            delayMinutes: 0,
            photoUrl: null,
            medicineId: reminder.medicineId,
            medicineNameSnapshot: null,
            category: reminder.category,
            amount: 0,
            stockDeducted: 0,
          }),
        );

        // 通知本人（站内）
        await this.notifRepo.save(
          this.notifRepo.create({
            id: randomUUID(),
            userId: reminder.userId,
            type: NotificationType.MISSED,
            title: '提醒已错过',
            content: `「${reminder.title}」已超时未完成`,
            linkUrl: '/today',
          }),
        );

        // 本人 Push（通道 B；页面关闭也能收到）
        await this.push.sendToUser(reminder.userId, {
          title: '提醒已错过',
          body: `「${reminder.title}」已超时未完成`,
          url: '/today',
        });

        // 亲友通知（仅通知开启 receiveMissed 的）
        const contacts = await this.contactRepo.find({
          where: { userId: reminder.userId, receiveMissed: true },
        });
        for (const contact of contacts) {
          if (!contact.appUserId) continue; // 短信通道 P2
          const dedupKey = `missed:${reminder.id}:${next.getTime()}:${contact.appUserId}`;
          const sent = await this.notifLogRepo.findOne({ where: { dedupKey } });
          if (sent) continue;
          await this.notifRepo.save(
            this.notifRepo.create({
              id: randomUUID(),
              userId: contact.appUserId,
              type: NotificationType.MISSED,
              title: '亲友漏服提醒',
              content: `你的亲友有一条提醒「${reminder.title}」未完成`,
              linkUrl: '/today',
            }),
          );
          await this.notifLogRepo.save(
            this.notifLogRepo.create({
              id: randomUUID(),
              userId: contact.appUserId,
              recipientType: 'app',
              recipient: contact.appUserId,
              channel: NotificationChannel.INAPP,
              dedupKey,
              status: NotificationStatus.SENT,
            }),
          );
        }

        this.logger.log(`漏服判定: ${reminder.title} (${reminder.id})`);
      }
    } catch (err) {
      this.logger.error(`漏服扫描异常: ${String(err)}`);
    }
  }
}
