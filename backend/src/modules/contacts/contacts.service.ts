/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9jb250YWN0cy9jb250YWN0cy5zZXJ2aWNlLnRzfDIwMjYtMDl8ODNjZTJhODIyYQ== */ */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { EmergencyContact } from './emergency-contact.entity';

/**
 * 亲友联系人 CRUD（FR-306 历史遗留补齐）：
 * 漏服扫描/库存预警的通知数据源（receiveMissed/receiveLowStock）；
 * appUserId 可关联布谷账户（通常从已绑定亲友中选择），站内通知通道使用。
 */
@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(EmergencyContact)
    private readonly contactRepo: Repository<EmergencyContact>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async list(userId: string) {
    return this.contactRepo.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  async create(
    userId: string,
    data: {
      name: string;
      phone?: string | null;
      relation?: string | null;
      appUserId?: string | null;
      receiveLowStock?: boolean;
      receiveMissed?: boolean;
    },
  ) {
    if (data.appUserId) {
      const exists = await this.userRepo.findOne({ where: { id: data.appUserId } });
      if (!exists) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '关联的布谷账户不存在' });
      }
    }
    const contact = await this.contactRepo.save(
      this.contactRepo.create({
        id: randomUUID(),
        userId,
        name: data.name,
        phone: data.phone ?? null,
        relation: data.relation ?? null,
        appUserId: data.appUserId ?? null,
        receiveLowStock: data.receiveLowStock ?? true,
        receiveMissed: data.receiveMissed ?? true,
      }),
    );
    return contact;
  }

  async update(
    userId: string,
    id: string,
    patch: {
      name?: string;
      phone?: string | null;
      relation?: string | null;
      appUserId?: string | null;
      receiveLowStock?: boolean;
      receiveMissed?: boolean;
    },
  ) {
    if (patch.appUserId) {
      const exists = await this.userRepo.findOne({ where: { id: patch.appUserId } });
      if (!exists) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '关联的布谷账户不存在' });
      }
    }
    // 规约：repo.update({id, userId}, patch)——归属校验 + 防 transformer 写回旧值
    const result = await this.contactRepo.update({ id, userId }, patch);
    if (!result.affected) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '联系人不存在' });
    }
    return this.contactRepo.findOne({ where: { id, userId } });
  }

  async remove(userId: string, id: string) {
    const result = await this.contactRepo.delete({ id, userId });
    if (!result.affected) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '联系人不存在' });
    }
    return { success: true };
  }
}
