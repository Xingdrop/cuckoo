import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { LessThan, Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { ReminderLog, ReminderLogStatus } from '../reminders/reminder-log.entity';
import { Reminder } from '../reminders/reminder.entity';
import { EmergencyContact } from '../contacts/emergency-contact.entity';
import { Notification, NotificationType } from './notification.entity';
import { NotificationLog, NotificationChannel, NotificationStatus } from './notification-log.entity';

/**
 * 漏服扫描（FR-307）：每分钟扫描超时未响应的提醒 → 置 missed → 通知本人 + 亲友。
 * 服务端权威判定（页面关闭也生效）。
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

      for (const reminder of overdue) {
        const next = reminder.nextTriggerAt!;
        const responded = await this.logRepo.findOne({
          where: { reminderId: reminder.id, scheduledTime: next },
        });
        if (responded) continue; // 已有响应（完成/延迟/跳过），不判定

        // 阈值检查（默认 30 分钟，超过才判定漏服）
        if (now.getTime() - next.getTime() < 30 * 60_000) continue;

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

        // 通知本人
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
