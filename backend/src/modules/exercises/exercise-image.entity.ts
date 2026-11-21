/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9leGVyY2lzZXMvZXhlcmNpc2UtaW1hZ2UuZW50aXR5LnRzfDIwMjYtMTF8 */
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Exercise } from './exercise.entity';

/** 微运动组图（1NF：imageUrls 数组拆子表；imageUrl 单图列保留） */
@Entity('exercise_images')
export class ExerciseImage {
  @PrimaryColumn('text')
  exerciseId: string;

  @PrimaryColumn({ type: 'integer' })
  sortOrder: number;

  @Column({ type: 'varchar' })
  url: string;

  @ManyToOne(() => Exercise, (e) => e.imageRows, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exerciseId' })
  exercise: Exercise;
}
