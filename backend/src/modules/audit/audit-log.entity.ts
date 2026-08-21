import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { utcDateTime } from '../../common/datetime.transformer';

/**
 * 审计日志（技术方案 §8.1：关键操作——注册/登录/删除等——写审计表，可追溯）。
 * 只追加不更新；敏感信息（如密码）不得写入 detail。
 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryColumn({ type: 'varchar' })
  id: string = randomUUID();

  /** 操作用户 id（匿名操作可为 null） */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  /** 动作标识，如 user.register / reminder.delete / post.delete */
  @Index()
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
