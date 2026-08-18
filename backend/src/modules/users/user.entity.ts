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

  @Column({ type: 'varchar' })
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
