/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9wbGFucy9wbGFuLmVudGl0eS50c3wyMDI2LTA5fDI2NzdlOTFhY2Y= */
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { utcDateTime } from '../../common/datetime.transformer';

export type PlanSourceType = 'self' | 'official' | 'share';

/**
 * 用户计划（2026-08 新增）：
 * - 本人创建（sourceType=self）：可在"我的计划"手动新建；可一键发帖
 * - 一键加入帖子/官方计划时自动生成（sourceType=share/official，sourceTitle 记录来源）
 * - isActive 开关：关闭后关联提醒不触发（前端展示，后端由 RemindersService 过滤）
 */
@Entity('plans')
export class Plan {
  @PrimaryColumn('text')
  id: string = randomUUID();

  @Column('text')
  userId: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', default: '' })
  description: string;

  /** self=自建 / official=官方计划 / share=来自帖子 */
  @Column({ type: 'varchar', default: 'self' })
  sourceType: PlanSourceType;

  /** 来源名称，如「官方计划：喝水计划」「来自 @alice 的帖子」 */
  @Column({ type: 'varchar', nullable: true })
  sourceTitle: string | null;

  /** 来源 id（帖子 id / 模板 id） */
  @Column({ type: 'varchar', nullable: true })
  sourceId: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** #18：加入计划（官方/帖子）时保存的提醒配置快照；开启开关时按它（重新）创建提醒 */
  @Column({ type: 'simple-json', nullable: true })
  config: Array<Record<string, unknown>> | null;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;
}
