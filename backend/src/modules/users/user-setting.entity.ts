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

  @Column({ default: true })
  notificationEnabled: boolean;

  @Column({ default: true })
  soundEnabled: boolean;

  @Column({ default: true })
  vibrationEnabled: boolean;

  @Column({ default: 'default' })
  theme: string;

  /** 漏服判定阈值（分钟），全局默认 30 */
  @Column({ default: 30 })
  missedThresholdMinutes: number;

  @Column({ default: false })
  showSkipButton: boolean;

  @Column({ default: 3 })
  maxDelayCount: number;
}
