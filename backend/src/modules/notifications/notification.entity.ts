import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export enum NotificationType {
  REMINDER = 'reminder',
  LOW_STOCK = 'low_stock',
  MISSED = 'missed',
  WEEKLY_REPORT = 'weekly_report',
  MONTHLY_REPORT = 'monthly_report',
  ACHIEVEMENT = 'achievement',
  SYSTEM = 'system',
}

/** 通知中心条目（站内通知） */
@Entity('notifications')
@Index(['userId', 'isRead'])
@Index(['userId', 'createdAt'])
export class Notification {
  @PrimaryColumn('text')
  id: string;

  @Index()
  @Column('text')
  userId: string;

  @Column({ type: 'text' })
  type: NotificationType;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  /** 点击跳转路由 */
  @Column({ nullable: true })
  linkUrl: string | null;

  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
