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

  @Column({ type: 'varchar',  default: true })
  notificationEnabled: boolean;

  @Column({ type: 'varchar',  default: true })
  soundEnabled: boolean;

  @Column({ type: 'varchar',  default: true })
  vibrationEnabled: boolean;

  @Column({ type: 'varchar',  default: 'default' })
  theme: string;

  /** 漏服判定阈值（分钟），全局默认 30 */
  @Column({ type: 'varchar',  default: 30 })
  missedThresholdMinutes: number;

  @Column({ type: 'varchar',  default: false })
  showSkipButton: boolean;

  @Column({ type: 'varchar',  default: 3 })
  maxDelayCount: number;
}
