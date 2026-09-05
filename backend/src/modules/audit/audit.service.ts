/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9hdWRpdC9hdWRpdC5zZXJ2aWNlLnRzfDIwMjYtMDl8MTRhZmFiZTljOA== */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

/**
 * 审计服务：关键操作写 audit_logs 表（只追加）。
 * 供 auth / reminders / medicines / social 等模块调用（各模块 import AuditModule）。
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /** 记录一次关键操作（detail 中严禁包含密码/密钥等敏感字段） */
  async record(
    action: string,
    userId: string | null,
    opts: { targetType?: string; targetId?: string; detail?: Record<string, unknown> } = {},
  ): Promise<void> {
    await this.repo.save(
      this.repo.create({
        id: randomUUID(),
        action,
        userId,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        detail: opts.detail ?? null,
      }),
    );
  }
}
