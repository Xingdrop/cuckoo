import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import webpush from 'web-push';
import { Device } from './device.entity';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Web Push 推送服务（通道 B：页面关闭时的提醒兜底）。
 * VAPID 密钥未配置时自动降级为 no-op（开发环境），配置见 .env.example。
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly enabled: boolean;

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    private readonly config: ConfigService,
  ) {
    const pub = this.config.get<string>('push.vapidPublicKey');
    const priv = this.config.get<string>('push.vapidPrivateKey');
    this.enabled = Boolean(pub && priv);
    if (this.enabled) {
      webpush.setVapidDetails(
        this.config.get<string>('push.vapidSubject') ?? 'mailto:admin@cuckoo.example.com',
        pub!,
        priv!,
      );
      this.logger.log('Web Push 已启用（VAPID 已配置）');
    } else {
      this.logger.warn('Web Push 未启用：缺少 VAPID 密钥（生成: npx web-push generate-vapid-keys）');
    }
  }

  /** 保存/更新订阅端点（幂等：endpoint 唯一） */
  async upsertDevice(
    userId: string,
    dto: { endpoint: string; keysAuth: string; keysP256dh: string; userAgent?: string },
  ): Promise<Device> {
    const existing = await this.deviceRepo.findOne({ where: { endpoint: dto.endpoint } });
    if (existing) {
      // 注意：不能用 save(entity)——TypeORM 1.x 对带 transformer 的列会写入数据库旧值
      await this.deviceRepo.update(
        { id: existing.id, userId },
        {
          keysAuth: dto.keysAuth,
          keysP256dh: dto.keysP256dh,
          userAgent: dto.userAgent ?? existing.userAgent,
          lastSeenAt: new Date(),
        },
      );
      return this.deviceRepo.findOneOrFail({ where: { id: existing.id } });
    }
    return this.deviceRepo.save(
      this.deviceRepo.create({
        id: randomUUID(),
        userId,
        endpoint: dto.endpoint,
        keysAuth: dto.keysAuth,
        keysP256dh: dto.keysP256dh,
        userAgent: dto.userAgent ?? null,
        lastSeenAt: new Date(),
      }),
    );
  }

  async removeDevice(userId: string, deviceId: string) {
    await this.deviceRepo.delete({ id: deviceId, userId });
    return { success: true };
  }

  async listDevices(userId: string): Promise<Device[]> {
    return this.deviceRepo.find({ where: { userId } });
  }

  /** 向用户所有设备推送；失效订阅自动清理 */
  async sendToUser(userId: string, payload: PushPayload) {
    if (!this.enabled) return { sent: 0, skipped: true };
    const devices = await this.deviceRepo.find({ where: { userId } });
    let sent = 0;
    for (const device of devices) {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { auth: device.keysAuth, p256dh: device.keysP256dh } },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // 订阅已失效，清理
          await this.deviceRepo.delete({ id: device.id });
          this.logger.log(`清理失效订阅: ${device.endpoint.slice(0, 40)}…`);
        } else {
          this.logger.warn(`推送失败 ${device.endpoint.slice(0, 40)}…: ${String(err)}`);
        }
      }
    }
    return { sent, skipped: false };
  }
}
