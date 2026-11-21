/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy91c2Vycy91c2VyLWhlYWx0aC1nb2FsLmVudGl0eS50c3wyMDI2LTExfDNlN2Y3NzVkODE= */
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

/** 用户健康目标（1NF：healthGoals 数组拆子表） */
@Entity('user_health_goals')
export class UserHealthGoal {
  @PrimaryColumn('text')
  userId: string;

  @PrimaryColumn('varchar')
  goal: string;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @ManyToOne(() => User, (u) => u.healthGoalsRows, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
