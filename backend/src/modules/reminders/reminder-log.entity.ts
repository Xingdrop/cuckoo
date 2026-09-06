/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9yZW1pbmRlcnMvcmVtaW5kZXItbG9nLmVudGl0eS50c3wyMDI2LTA5fDZlOTFhZGY5NmU= */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { Reminder } from './reminder.entity';
import { utcDateTime } from '../../common/datetime.transformer';

export enum ReminderLogStatus {
  COMPLETED = 'completed',
  DELAYED = 'delayed',
  SKIPPED = 'skipped',
  MISSED = 'missed',
  CHALLENGE_COMPLETED = 'challenge_completed',
  MANUAL = 'manual',
  /** #26：拍照记录（独立于完成标记——拍照即提交，可再次拍照替换） */
  PHOTO = 'photo',
}

/** 提醒执行记录。UNIQUE(reminderId, scheduledTime) 保证同一时刻只记录一次（幂等） */
@Entity('reminder_logs')
@Unique(['reminderId', 'scheduledTime'])
@Index(['userId', 'scheduledTime'])
export class ReminderLog {
  @PrimaryColumn('text')
  id: string;

  /** 关联提醒（PRN/手动记录可为空） */
  @Column('text', { nullable: true })
  reminderId: string | null;

  @ManyToOne(() => Reminder, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'reminderId' })
  reminder: Reminder | null;

  @Index()
  @Column('text')
  userId: string;

  /** 计划触发时间 */
  @Column('datetime')
  scheduledTime: Date;

  /** 用户实际操作时间 */
  @Column({ type: 'datetime', transformer: utcDateTime, nullable: true })
  actualTime: Date | null;

  @Column({ type: 'text' })
  status: ReminderLogStatus;

  /** 延迟分钟数（若延迟） */
  @Column({ type: 'int', default: 0 })
  delayMinutes: number;

  /** 拍照打卡照片 URL */
  @Column({ type: 'varchar',  nullable: true })
  photoUrl: string | null;

  /** 关联药品（若为用药提醒） */
  @Column('text', { nullable: true })
  medicineId: string | null;

  /** 本次扣减库存数量 */
  @Column({ type: 'int', default: 0 })
  stockDeducted: number;

  /** 用药名快照（药品删除后仍可读） */
  @Column({ type: 'varchar',  nullable: true })
  medicineNameSnapshot: string | null;

  /** 分类快照（统计用） */
  @Column({ type: 'varchar',  nullable: true })
  category: string | null;

  /** 数量快照（如喝水 ml），通用 */
  @Column({ type: 'int', default: 0 })
  amount: number;

  /** 2026-09-06：可选文字记录（提醒弹窗随手记，≤500 字） */
  @Column('text', { nullable: true })
  note: string | null;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;
}
