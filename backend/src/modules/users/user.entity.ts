/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy91c2Vycy91c2VyLmVudGl0eS50c3wyMDI2LTA5fDg3ZDQxZDQ0MDc= */
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Reminder } from '../reminders/reminder.entity';
import { Medicine } from '../medicines/medicine.entity';
import { utcDateTime } from '../../common/datetime.transformer';

@Entity('users')
export class User {
  @PrimaryColumn('text')
  id: string;

  @Column({ type: 'varchar',  unique: true })
  username: string;

  @Column({ type: 'varchar',  unique: true, nullable: true })
  phone: string | null;

  /** select: false —— 默认查询不带出，避免随关系展开泄露（登录处显式 addSelect） */
  @Column({ type: 'varchar', select: false })
  passwordHash: string;

  @Column({ type: 'varchar',  nullable: true })
  avatarUrl: string | null;

  /** 健康目标（多选），JSON 数组：medication / sedentary / water / sleep / work */
  @Column({ type: 'simple-json', nullable: true })
  healthGoals: string[] | null;

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
