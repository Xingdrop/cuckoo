/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9zb2NpYWwvc2Vuc2l0aXZlLXdvcmQuZW50aXR5LnRzfDIwMjYtMDl8YTNlMjExMGY5Ng== */
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { utcDateTime } from '../../common/datetime.transformer';

export enum SensitiveWordLevel {
  BLOCK = 'block',
  MASK = 'mask',
}

/** 敏感词库（社区内容治理，运营可维护） */
@Entity('sensitive_words')
export class SensitiveWord {
  @PrimaryColumn('text')
  id: string;

  @Column({ type: 'varchar',  unique: true })
  word: string;

  @Column({ type: 'text', default: SensitiveWordLevel.MASK })
  level: SensitiveWordLevel;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;
}
