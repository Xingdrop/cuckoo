/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvY29tbW9uL2d1YXJkcy9jdWNrb28tdGhyb3R0bGVyLmd1YXJkLnRzfDIwMjYtMDl8NWFlYzA2ZTFkZA== */
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * 全局限流 Guard（文档 §6.1：登录/注册 5 次/分/IP；普通接口 100 次/分/用户）。
 *
 * tracker 策略：
 * - 已登录请求（JwtAuthGuard 先执行并挂载 req.user）→ 按 userId 限流（同账号多设备共享配额）
 * - 匿名请求（登录/注册等 @Public 路由）→ 按 IP 限流
 */
@Injectable()
export class CuckooThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req?.user?.id ? `user:${req.user.id}` : `ip:${req?.ip ?? 'unknown'}`;
  }
}
