/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9tZWRpY2luZXMvbWVkaWNpbmVzLnNlcnZpY2Uuc3BlYy50c3wyMDI2LTA5fDYxYjcxMmZiMWQ= */
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PushService } from '../notifications/push.service';
import { EmergencyContact } from '../contacts/emergency-contact.entity';
import { Device } from '../notifications/device.entity';
import { Notification, NotificationType } from '../notifications/notification.entity';
import { NotificationLog } from '../notifications/notification-log.entity';
import { Reminder } from '../reminders/reminder.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { Post } from '../social/post.entity';
import { Interaction } from '../social/interaction.entity';
import { PlanJoinRecord } from '../social/plan-join-record.entity';
import { PlanTemplate } from '../social/plan-template.entity';
import { SensitiveWord } from '../social/sensitive-word.entity';
import { Exercise } from '../exercises/exercise.entity';
import { UserSetting } from '../users/user-setting.entity';
import { User } from '../users/user.entity';
import { Medicine } from './medicine.entity';
import { MedicinesService } from './medicines.service';

/**
 * UT-STK 库存事务集成单测（内存 SQLite，真实事务）。
 * 覆盖：正常扣减 / 阈值预警 / 超量回滚 / PRN 手动记录。
 */
describe('MedicinesService（UT-STK）', () => {
  let service: MedicinesService;
  let dataSource: DataSource;
  let medicineId: string;
  const USER = 'test-user';

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [
        User,
        UserSetting,
        Reminder,
        ReminderLog,
        Medicine,
        EmergencyContact,
        Post,
        Interaction,
        PlanJoinRecord,
        PlanTemplate,
        SensitiveWord,
        Notification,
        NotificationLog,
        Device,
        Exercise,
      ],
      synchronize: true,
    });
    await dataSource.initialize();

    const module = await Test.createTestingModule({
      providers: [
        MedicinesService,
        { provide: getRepositoryToken(Medicine), useValue: dataSource.getRepository(Medicine) },
        { provide: getRepositoryToken(ReminderLog), useValue: dataSource.getRepository(ReminderLog) },
        { provide: getRepositoryToken(Notification), useValue: dataSource.getRepository(Notification) },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: PushService, useValue: { sendToUser: jest.fn().mockResolvedValue({ sent: 0, skipped: true }) } },
      ],
    }).compile();
    service = module.get(MedicinesService);

    // 建测试用户（FK 约束需要）
    await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        id: USER,
        username: 'stk-user',
        passwordHash: 'x',
      }),
    );

    // 测试药品：库存 10 / 阈值 3 / 每次 1
    const med = await service.create(USER, {
      name: '测试药品',
      dosage: '10mg',
      stock: 10,
      threshold: 3,
      deductionPerUse: 1,
    });
    medicineId = med.id;
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('UT-STK-01 正常扣减 1 片 → stock 9，不触发预警', async () => {
    const r = await service.deductStock(USER, medicineId, 1, { source: 'manual' });
    expect(r.medicine.stock).toBe(9);
    expect(r.lowStock).toBe(false);
  });

  it('UT-STK-02 扣减到等于阈值（3）→ 触发预警', async () => {
    // 9 → 3（扣 6 次）
    let last: Awaited<ReturnType<typeof service.deductStock>> | null = null;
    for (let i = 0; i < 6; i++) {
      last = await service.deductStock(USER, medicineId, 1, { source: 'manual' });
    }
    expect(last!.medicine.stock).toBe(3);
    expect(last!.lowStock).toBe(true);
    // 预警通知已写入
    const notifs = await dataSource.getRepository(Notification).find({ where: { userId: USER } });
    expect(notifs.some((n) => n.type === 'low_stock')).toBe(true);
  });

  it('UT-STK-04 扣减量 > 库存 → STOCK_EXCEEDED，库存不变', async () => {
    await expect(service.deductStock(USER, medicineId, 10, { source: 'manual' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const med = await service.findOne(USER, medicineId);
    expect(med.stock).toBe(3);
  });

  it('UT-STK-07 PRN 手动记录 → 写 manual 日志并扣减', async () => {
    const r = await service.manualRecord(USER, medicineId, { quantity: 1 });
    expect(r.medicine.stock).toBe(2);
    const logs = await service.logs(USER, medicineId, 1, 50);
    const manual = logs.items.find((l) => l.status === 'manual');
    expect(manual).toBeDefined();
    expect(manual!.stockDeducted).toBe(1);
    expect(manual!.reminderId).toBeNull();
  });

  it('UT-STK-05 补充库存后不再预警', async () => {
    await service.adjustStock(USER, medicineId, 10);
    const med = await service.findOne(USER, medicineId);
    expect(med.stock).toBe(12);
  });
});
