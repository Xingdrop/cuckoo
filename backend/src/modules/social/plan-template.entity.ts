import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { utcDateTime } from '../../common/datetime.transformer';

export enum PlanTemplateStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

/** 官方计划模板（运营发布，用户一键加入） */
@Entity('plan_templates')
@Index(['status'])
export class PlanTemplate {
  @PrimaryColumn('text')
  id: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text' })
  description: string;

  /** 提醒配置 JSON（可包含多条提醒规则，供加入时批量创建） */
  @Column({ type: 'simple-json' })
  reminderConfig: Record<string, unknown>[];

  @Column({ type: 'simple-json', default: () => "'[]'" })
  mediaUrls: string[];

  @Column({ type: 'text', default: PlanTemplateStatus.DRAFT })
  status: PlanTemplateStatus;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column('text')
  createdBy: string;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;

  @UpdateDateColumn({ transformer: utcDateTime })
  updatedAt: Date;
}
