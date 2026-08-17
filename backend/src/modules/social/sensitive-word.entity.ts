import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

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

  @CreateDateColumn()
  createdAt: Date;
}
