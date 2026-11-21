/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9leGVyY2lzZXMvZXhlcmNpc2UuZW50aXR5LnRzfDIwMjYtMTF8OTlkMGVlNDhlNA== */
import {
  AfterLoad,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { ExerciseImage } from './exercise-image.entity';
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

  /** 跟练组图（分解动作 2~3 帧；1NF：实际存 exercise_images 子表） */
  imageUrls?: string[] | null;

  @OneToMany(() => ExerciseImage, (i) => i.exercise, { eager: true })
  imageRows?: ExerciseImage[];

  @AfterLoad()
  projectImages(): void {
    const rows = this.imageRows ?? [];
    this.imageUrls = rows.length
      ? [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.url)
      : null;
    Object.defineProperty(this, 'imageRows', {
      value: rows,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }

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
