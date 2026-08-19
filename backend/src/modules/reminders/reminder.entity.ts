import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Medicine } from '../medicines/medicine.entity';
import { utcDateTime } from '../../common/datetime.transformer';

/** 提醒分类 */
export enum ReminderCategory {
  MEDICATION = 'medication',
  EXERCISE = 'exercise',
  WATER = 'water',
  REST = 'rest',
  WORK = 'work',
  CUSTOM = 'custom',
}

/** 重复规则类型 */
export enum RepeatType {
  ONCE = 'once',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  INTERVAL = 'interval',
}

export enum IntervalUnit {
  DAY = 'day',
  HOUR = 'hour',
  WEEK = 'week',
}

/** 重复规则（JSON 列） */
export interface RepeatRule {
  type: RepeatType;
  /** weekly: [0..6] 星期 */
  daysOfWeek?: number[];
  /** monthly: 1..31，>28 时遇小月顺延到月末 */
  dayOfMonth?: number;
  /** interval: 间隔数值 */
  intervalValue?: number;
  /** interval: 间隔单位 */
  intervalUnit?: IntervalUnit;
}

/** 提醒内容（JSON 列） */
export interface ReminderContent {
  text?: string;
  imageUrls?: string[];
  videoUrl?: string;
  /** 可选 APP 内跳转路由 */
  jumpTo?: string;
}

/** 提醒方式（JSON 列） */
export interface ReminderMethod {
  fullScreen?: boolean;
  sound?: string;
  vibrationEnabled?: boolean;
  gradualSound?: boolean;
}

/** 延迟设置（JSON 列） */
export interface DelaySettings {
  presetOptions?: number[];
  customEnabled?: boolean;
  maxDelayCount?: number;
}

/** 拍照挑战（JSON 列） */
export interface ChallengeSettings {
  enabled?: boolean;
  allowGallery?: boolean;
}

@Entity('reminders')
@Index(['userId', 'isActive'])
@Index(['nextTriggerAt'])
export class Reminder {
  @PrimaryColumn('text')
  id: string;

  @Index()
  @Column('text')
  userId: string;

  @ManyToOne(() => User, (u) => u.reminders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text' })
  category: ReminderCategory;

  /** 自定义分类名称（category=custom 时，默认"自定义"） */
  @Column({ type: 'varchar', nullable: true })
  categoryLabel: string | null;

  /** 自定义分类图标（emoji） */
  @Column({ type: 'varchar', nullable: true })
  categoryIcon: string | null;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'simple-json' })
  repeatRule: RepeatRule;

  @Column({ type: 'datetime', transformer: utcDateTime })
  startDate: Date;

  /** 每日多时间点（HH:mm 数组，daily/weekly 适用）；为空时用 startDate 的时间 */
  @Column({ type: 'simple-json', nullable: true })
  times: string[] | null;

  @Column({ type: 'datetime', transformer: utcDateTime, nullable: true })
  endDate: Date | null;

  /** 调度引擎依赖：下一次触发时间（UTC），由 computeNextTrigger 计算 */
  @Column({ type: 'datetime', transformer: utcDateTime, nullable: true })
  nextTriggerAt: Date | null;

  @Column({ type: 'simple-json', default: () => "'{}'" })
  content: ReminderContent;

  @Column({ type: 'simple-json', default: () => "'{}'" })
  method: ReminderMethod;

  @Column({ type: 'simple-json', default: () => "'{}'" })
  delaySettings: DelaySettings;

  @Column({ type: 'simple-json', default: () => "'{}'" })
  challenge: ChallengeSettings;

  /** 用药提醒关联药品（可空，删除药品后保留快照文本在 content 中） */
  @Column('text', { nullable: true })
  medicineId: string | null;

  @ManyToOne(() => Medicine, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'medicineId' })
  medicine: Medicine | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;

  @UpdateDateColumn({ transformer: utcDateTime })
  updatedAt: Date;

  @DeleteDateColumn({ transformer: utcDateTime })
  deletedAt: Date | null;
}
