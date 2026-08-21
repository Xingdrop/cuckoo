import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Notification, NotificationType } from '../notifications/notification.entity';
import { ReminderLog, ReminderLogStatus } from '../reminders/reminder-log.entity';
import { CreateMedicineDto } from './dto/create-medicine.dto';
import { DeductStockDto } from './dto/deduct-stock.dto';
import { UpdateMedicineDto } from './dto/update-medicine.dto';
import { Medicine } from './medicine.entity';

/**
 * 药品管理 + 库存事务（FR-301~305, FR-308）。
 * 库存扣减在数据库事务内执行：扣减 → 预警判定 → 写服药日志 → 写站内通知。
 */
@Injectable()
export class MedicinesService {
  constructor(
    @InjectRepository(Medicine)
    private readonly medicineRepo: Repository<Medicine>,
    @InjectRepository(ReminderLog)
    private readonly logRepo: Repository<ReminderLog>,
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, dto: CreateMedicineDto) {
    const medicine = this.medicineRepo.create({
      id: randomUUID(),
      userId,
      name: dto.name,
      dosage: dto.dosage ?? null,
      administration: dto.administration ?? null,
      stock: dto.stock ?? 0,
      threshold: dto.threshold ?? 0,
      expiryDate: dto.expiryDate ?? null,
      instructions: dto.instructions ?? null,
      photoUrl: dto.photoUrl ?? null,
      deductionPerUse: dto.deductionPerUse ?? 1,
      notifyOnLowStock: dto.notifyOnLowStock ?? true,
    });
    return this.medicineRepo.save(medicine);
  }

  async list(userId: string) {
    return this.medicineRepo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(userId: string, id: string) {
    const medicine = await this.medicineRepo.findOne({ where: { id, userId } });
    if (!medicine) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '药品不存在' });
    }
    return medicine;
  }

  async update(userId: string, id: string, dto: UpdateMedicineDto) {
    await this.findOne(userId, id);
    await this.medicineRepo.update({ id, userId }, dto);
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.medicineRepo.softDelete({ id, userId });
    void this.audit.record('medicine.delete', userId, { targetType: 'medicine', targetId: id });
    return { success: true };
  }

  /** 调整库存（补充/手动增减） */
  async adjustStock(userId: string, id: string, delta: number) {
    const medicine = await this.findOne(userId, id);
    const newStock = Math.max(0, medicine.stock + delta);
    await this.medicineRepo.update({ id, userId }, { stock: newStock });
    return this.findOne(userId, id);
  }

  /**
   * 扣减库存（服药确认时调用，事务保证原子性）。
   * 返回 { medicine, lowStock: boolean }；低库存时已写入站内通知。
   */
  async deductStock(
    userId: string,
    medicineId: string,
    quantity: number,
    opts: {
      source?: 'reminder' | 'manual';
      scheduledTime?: Date;
      note?: string;
      reminderId?: string | null;
    } = {},
  ) {
    return this.dataSource.transaction(async (manager) => {
      const medicineRepo = manager.getRepository(Medicine);
      const logRepo = manager.getRepository(ReminderLog);
      const notifRepo = manager.getRepository(Notification);

      const medicine = await medicineRepo.findOne({ where: { id: medicineId, userId } });
      if (!medicine) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: '药品不存在' });
      }
      if (quantity > medicine.stock) {
        throw new BadRequestException({
          code: 'STOCK_EXCEEDED',
          message: `库存不足：当前仅剩 ${medicine.stock} ${medicine.dosage ?? '份'}`,
        });
      }

      // 1. 扣减库存
      medicine.stock -= quantity;
      await medicineRepo.update({ id: medicineId, userId }, { stock: medicine.stock });

      // 2. 写服药记录（manual 时 status=manual，无关联提醒）
      const log = logRepo.create({
        id: randomUUID(),
        reminderId: opts.source === 'manual' ? null : (opts.reminderId ?? null),
        userId,
        scheduledTime: opts.scheduledTime ?? new Date(),
        actualTime: new Date(),
        status: opts.source === 'manual' ? ReminderLogStatus.MANUAL : ReminderLogStatus.COMPLETED,
        delayMinutes: 0,
        photoUrl: null,
        medicineId,
        medicineNameSnapshot: medicine.name,
        stockDeducted: quantity,
      });
      await logRepo.save(log);

      // 3. 预警判定：扣减后 ≤ 阈值 → 站内通知
      let lowStock = false;
      if (medicine.notifyOnLowStock && medicine.stock <= medicine.threshold && medicine.threshold > 0) {
        lowStock = true;
        await notifRepo.save(
          notifRepo.create({
            id: randomUUID(),
            userId,
            type: NotificationType.LOW_STOCK,
            title: '库存预警',
            content: `${medicine.name} 库存仅剩 ${medicine.stock} ${medicine.dosage ?? '份'}，请及时补充`,
            linkUrl: '/medicines',
          }),
        );
      }

      return { medicine, lowStock };
    });
  }

  /** PRN 按需服药记录（不关联提醒，直接扣库存 + 记录） */
  async manualRecord(userId: string, medicineId: string, dto: DeductStockDto) {
    const result = await this.deductStock(userId, medicineId, dto.quantity, {
      source: 'manual',
      note: dto.note,
    });
    return result;
  }

  /** 服药历史（按药品，分页） */
  async logs(userId: string, medicineId: string, page = 1, pageSize = 20) {
    const [items, total] = await this.logRepo.findAndCount({
      where: { userId, medicineId },
      order: { scheduledTime: 'DESC' },
      skip: (page - 1) * pageSize,
      take: Math.min(pageSize, 100),
    });
    return { items, total, page, pageSize };
  }
}
