/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy91c2Vycy91c2VyLXNldHRpbmcuZW50aXR5LnRzfDIwMjYtMTF8OGE1ZTAxZTEyMQ== */
import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

/** 用户偏好设置（独立表，避免 User 表字段膨胀） */
@Entity('user_settings')
export class UserSetting {
  @PrimaryColumn('text')
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'boolean', default: true })
  notificationEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  soundEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  vibrationEnabled: boolean;

  @Column({ type: 'varchar',  default: 'default' })
  theme: string;

  /** 漏服判定阈值（分钟），全局默认 30 */
  @Column({ type: 'int', default: 30 })
  missedThresholdMinutes: number;

  @Column({ type: 'boolean', default: false })
  showSkipButton: boolean;

  @Column({ type: 'int', default: 3 })
  maxDelayCount: number;

  /** 每日喝水目标（ml） */
  @Column({ type: 'int', default: 2000 })
  waterGoalMl: number;

  /** #26：喝水（当日达标）作为完成率可选统计项（今日完成率面板逐项勾选） */
  @Column({ type: 'boolean', default: false })
  waterCountInRate: boolean;
}
