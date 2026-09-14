/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9yZXBvcnRzL3JlcG9ydC5lbnRpdHkudHN8MjAyNi0wOXxiN2IxYWUwZGNj */ */
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { utcDateTime } from '../../common/datetime.transformer';

export enum ReportType {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

/**
 * 报告快照（FR-704/705）：定时生成时计算并落库，通知中心跳转报告页展示。
 * period：周报 `2026-W35`；月报 `2026-08`。同用户同 type 同 period 唯一（重复生成覆盖 data，不重复通知）。
 * 注意：SQLite 的索引名全局唯一，新实体为避免与 TypeORM 1.1.0 synchronize 的索引名冲突，
 * 仅声明 Unique 约束（自动建 UNIQUE 索引），不声明额外 @Index()。
 */
@Entity('reports')
@Unique(['userId', 'type', 'period'])
export class Report {
  @PrimaryColumn('text')
  id: string = randomUUID();

  @Column('text')
  userId: string;

  @Column({ type: 'text' })
  type: ReportType;

  /** 周期标识：2026-W35 / 2026-08 */
  @Column({ type: 'varchar' })
  period: string;

  /** 报告数据（结构见 docs/交接文档.md §7.11） */
  @Column({ type: 'simple-json' })
  data: Record<string, unknown>;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;
}
