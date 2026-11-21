/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy91c2Vycy91c2VyLmVudGl0eS50c3wyMDI2LTExfDhkODY4MGViZGI= */
import {
  AfterLoad,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Reminder } from '../reminders/reminder.entity';
import { Medicine } from '../medicines/medicine.entity';
import { UserHealthGoal } from './user-health-goal.entity';
import { utcDateTime } from '../../common/datetime.transformer';

@Entity('users')
// 软删除后允许复用用户名/手机号：唯一性只在未删除行内生效
@Index('UQ_users_username_active', ['username'], { unique: true, where: 'deletedAt IS NULL' })
@Index('UQ_users_phone_active', ['phone'], { unique: true, where: 'deletedAt IS NULL' })
export class User {
  @PrimaryColumn('text')
  id: string;

  @Column({ type: 'varchar' })
  username: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  /** select: false —— 默认查询不带出，避免随关系展开泄露（登录处显式 addSelect） */
  @Column({ type: 'varchar', select: false })
  passwordHash: string;

  @Column({ type: 'varchar',  nullable: true })
  avatarUrl: string | null;

  /**
   * 健康目标（多选）：medication / sedentary / water / sleep / work。
   * 1NF 改造后由 healthGoalsRows 子表投影，保持 API 契约不变。
   */
  healthGoals?: string[] | null;

  @OneToMany(() => UserHealthGoal, (g) => g.user, { eager: true })
  healthGoalsRows?: UserHealthGoal[];

  @AfterLoad()
  projectHealthGoals(): void {
    const rows = this.healthGoalsRows ?? [];
    this.healthGoals = rows.length
      ? [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map((g) => g.goal)
      : null;
    Object.defineProperty(this, 'healthGoalsRows', {
      value: rows,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }

  /** IANA 时区，如 Asia/Shanghai */
  @Column({ type: 'varchar',  default: 'Asia/Shanghai' })
  timezone: string;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;

  @UpdateDateColumn({ transformer: utcDateTime })
  updatedAt: Date;

  @DeleteDateColumn({ transformer: utcDateTime })
  deletedAt: Date | null;

  @OneToMany(() => Reminder, (r) => r.user)
  reminders: Reminder[];

  @OneToMany(() => Medicine, (m) => m.user)
  medicines: Medicine[];
}
