/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9hY2hpZXZlbWVudHMvYWNoaWV2ZW1lbnQuZW50aXR5LnRzfDIwMjYtMDl8N2I3NDlmYzU5NQ== */
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { utcDateTime } from '../../common/datetime.transformer';

export type AchievementType =
  | 'streak_7'
  | 'streak_30'
  | 'streak_100'
  | 'streak_365'
  | 'medication_100'
  | 'exercise_50'
  | 'water_200';

/** 成就规则（规则表驱动，运营可扩展；type 为业务主键） */
@Entity('achievement_rules')
export class AchievementRule {
  @PrimaryColumn('varchar')
  type: AchievementType;

  @Column('varchar')
  name: string;

  @Column('varchar')
  description: string;

  /** emoji 图标 */
  @Column('varchar')
  icon: string;

  /** 达成阈值 */
  @Column('int')
  threshold: number;

  /** 计量单位：天 / 次 */
  @Column({ type: 'varchar', default: '次' })
  unit: string;

  @Column({ type: 'int', default: 1 })
  sortOrder: number;
}

/** 已达成成就（UNIQUE(userId,type) 幂等） */
@Entity('achievements')
@Unique(['userId', 'type'])
export class Achievement {
  @PrimaryColumn('text')
  id: string = randomUUID();

  @Column('text')
  userId: string;

  @Column('varchar')
  type: AchievementType;

  @CreateDateColumn({ transformer: utcDateTime })
  achievedAt: Date;
}
