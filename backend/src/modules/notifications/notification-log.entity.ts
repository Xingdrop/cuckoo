/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9ub3RpZmljYXRpb25zL25vdGlmaWNhdGlvbi1sb2cuZW50aXR5LnRzfDIwMjYtMDl8MzYyM2ZkNjM0NQ== */ */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { utcDateTime } from '../../common/datetime.transformer';

export enum NotificationChannel {
  PUSH = 'push',
  INAPP = 'inapp',
}

export enum NotificationStatus {
  SENT = 'sent',
  FAILED = 'failed',
}

/** 通知发送流水：去重 + 送达状态追踪（避免亲友重复收到通知） */
@Entity('notification_logs')
@Index(['dedupKey'])
export class NotificationLog {
  @PrimaryColumn('text')
  id: string;

  /** 关联通知中心条目（站内通知时） */
  @Column('text', { nullable: true })
  notificationId: string | null;

  /** 接收者（APP 用户） */
  @Index()
  @Column('text')
  userId: string;

  /** 接收者类型：user=本人 / app=APP 用户亲友 / phone=手机号亲友（短信预留） */
  @Column({ type: 'varchar',  default: 'user' })
  recipientType: string;

  /** 目标（appUserId 或手机号） */
  @Column({ type: 'varchar',  nullable: true })
  recipient: string | null;

  @Column({ type: 'text' })
  channel: NotificationChannel;

  /** 幂等去重键，如 lowstock:{medicineId} / missed:{reminderId}:{scheduledTime} */
  @Column({ type: 'varchar',  nullable: true })
  dedupKey: string | null;

  @Column({ type: 'text', default: NotificationStatus.SENT })
  status: NotificationStatus;

  @CreateDateColumn({ transformer: utcDateTime })
  sentAt: Date;
}
