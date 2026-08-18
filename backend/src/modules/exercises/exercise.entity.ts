import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { utcDateTime } from '../../common/datetime.transformer';

export enum ExerciseCategory {
  STRETCH = 'stretch',
  KEGEL = 'kegel',
  NECK = 'neck',
  EYE = 'eye',
  STAND = 'stand',
  OTHER = 'other',
}

/** 微运动库条目（50+ 种，种子数据 ≥10 种起步） */
@Entity('exercises')
export class Exercise {
  @PrimaryColumn('text')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  /** 步骤文字说明 */
  @Column({ type: 'text' })
  steps: string;

  @Column({ type: 'varchar',  nullable: true })
  imageUrl: string | null;

  @Column({ type: 'varchar',  nullable: true })
  videoUrl: string | null;

  /** 建议时长（秒） */
  @Column({ type: 'int', default: 60 })
  durationSeconds: number;

  @Column({ type: 'text' })
  category: ExerciseCategory;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;
}
