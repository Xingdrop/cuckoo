/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9hdWRpdC9hdWRpdC1sb2cuZW50aXR5LnRzfDIwMjYtMDl8MzI1ZmY3YjExMg== */
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { utcDateTime } from '../../common/datetime.transformer';

/**
 * 审计日志（技术方案 §8.1：关键操作——注册/登录/删除等——写审计表，可追溯）。
 * 只追加不更新；敏感信息（如密码）不得写入 detail。
 * 注意：与其它 2026-08 新增实体一样，不声明 @Index()（SQLite 索引名全局唯一，
 * 避免 TypeORM 1.1.0 synchronize 的索引名冲突）。
 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryColumn({ type: 'varchar' })
  id: string = randomUUID();

  /** 操作用户 id（匿名操作可为 null） */
  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  /** 动作标识，如 user.register / reminder.delete / post.delete */
  @Column({ type: 'varchar' })
  action: string;

  @Column({ type: 'varchar', nullable: true })
  targetType: string | null;

  @Column({ type: 'varchar', nullable: true })
  targetId: string | null;

  /** 附加上下文（JSON，不含敏感字段） */
  @Column({ type: 'simple-json', nullable: true })
  detail: Record<string, unknown> | null;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;
}
