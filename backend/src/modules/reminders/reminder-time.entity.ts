/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9yZW1pbmRlcnMvcmVtaW5kZXItdGltZS5lbnRpdHkudHN8MjAyNi0xMXw5MjNlNjhiM2Yw */
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Reminder } from './reminder.entity';

/**
 * 提醒时间点（1NF：多值列 times 拆子表）。
 * 主键 (reminderId, time) 保证同一提醒下不重复；sortOrder 保留用户原始顺序。
 */
@Entity('reminder_times')
export class ReminderTime {
  @PrimaryColumn('text')
  reminderId: string;

  @PrimaryColumn('varchar')
  time: string;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @ManyToOne(() => Reminder, (r) => r.timesRows, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reminderId' })
  reminder: Reminder;
}
