/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9yZW1pbmRlcnMvcmVtaW5kZXJzLnNlcnZpY2Uuc3BlYy50c3wyMDI2LTA5fDczNGI0NjA3NGM= */
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Medicine } from '../medicines/medicine.entity';
import { Notification } from '../notifications/notification.entity';
import { AchievementsService } from '../achievements/achievements.service';
import { PlansService } from '../plans/plans.service';
import { Plan } from '../plans/plan.entity';
import { User } from '../users/user.entity';
import { UserSetting } from '../users/user-setting.entity';
import { Reminder, ReminderCategory, RepeatType } from './reminder.entity';
import { ReminderLog, ReminderLogStatus } from './reminder-log.entity';
import { RemindersService, findDelayedLogForSlot } from './reminders.service';

/**
 * UT-ACK 提醒执行状态机单测（内存 SQLite，真实事务）。
 * ack() 的归槽矩阵是全项目最精密的业务逻辑（#7/#8/#58/#31 多轮真机根因修复都在此）：
 * 新建日志 / 幂等 duplicate / photo·note 槽升级 / delayed 落地 / missed 补完成 /
 * 二次延迟累计 / 延迟槽回匹配 / 库存扣减回滚 / 留言 / 喝水与延迟输入校验。
 */
describe('RemindersService ack 状态机（UT-ACK）', () => {
  let service: RemindersService;
  let dataSource: DataSource;
  let logRepo: Repository<ReminderLog>;
  const USER = 'ack-user';
  const TZ = 'Asia/Shanghai';

  /** 固定过去日期的本地 08:00 槽（与测试运行日期无关，调度断言确定） */
  const SLOT = new Date('2026-09-10T00:00:00.000Z'); // 本地 2026-09-10 08:00

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [User, UserSetting, Reminder, ReminderLog, Medicine, Notification, Plan],
      synchronize: true,
    });
    await dataSource.initialize();
    logRepo = dataSource.getRepository(ReminderLog);

    const module = await Test.createTestingModule({
      providers: [
        RemindersService,
        { provide: getRepositoryToken(Reminder), useValue: dataSource.getRepository(Reminder) },
        { provide: getRepositoryToken(ReminderLog), useValue: logRepo },
        { provide: getRepositoryToken(User), useValue: dataSource.getRepository(User) },
        { provide: getRepositoryToken(UserSetting), useValue: dataSource.getRepository(UserSetting) },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: PlansService, useValue: { nameMap: jest.fn().mockResolvedValue(new Map()) } },
        { provide: AchievementsService, useValue: { check: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();
    service = module.get(RemindersService);

    await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({ id: USER, username: 'ack-user', passwordHash: 'x' }),
    );
    await dataSource.getRepository(UserSetting).save(
      dataSource.getRepository(UserSetting).create({ userId: USER }),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  /** 建一条提醒（默认每日重复） */
  async function mkReminder(overrides: Partial<Reminder> = {}): Promise<Reminder> {
    const r = dataSource.getRepository(Reminder).create({
      id: `r-${Math.random().toString(36).slice(2, 10)}`,
      userId: USER,
      category: ReminderCategory.WATER,
      title: '测试提醒',
      repeatRule: { type: RepeatType.DAILY },
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      isActive: true,
      nextTriggerAt: new Date('2026-09-11T00:00:00.000Z'),
      ...overrides,
    });
    return dataSource.getRepository(Reminder).save(r);
  }

  /** 预置某槽位日志 */
  async function seedLog(
    reminderId: string,
    status: ReminderLogStatus,
    scheduledTime: Date,
    extra: Partial<ReminderLog> = {},
  ): Promise<ReminderLog> {
    const log = logRepo.create({
      id: `log-${Math.random().toString(36).slice(2, 10)}`,
      reminderId,
      userId: USER,
      scheduledTime,
      actualTime: scheduledTime,
      status,
      delayMinutes: 0,
      photoUrl: null,
      medicineId: null,
      medicineNameSnapshot: null,
      category: ReminderCategory.WATER,
      amount: 0,
      stockDeducted: 0,
      ...extra,
    });
    return logRepo.save(log);
  }

  const nextTriggerOf = (id: string) =>
    dataSource.getRepository(Reminder).findOneOrFail({ where: { id } }).then((r) => r.nextTriggerAt);
  const logsOf = (id: string) => logRepo.find({ where: { reminderId: id } });

  // ===== A. 新建日志路径 =====

  it('UT-ACK-01 每日提醒完成 → 日志 completed，nextTriggerAt 推进到未来', async () => {
    const r = await mkReminder();
    const out = await service.ack(USER, r.id, {
      status: ReminderLogStatus.COMPLETED,
      scheduledTime: SLOT.toISOString(),
    });
    expect(out.ok).toBe(true);
    expect(out.duplicate).toBeFalsy();
    const logs = await logsOf(r.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(ReminderLogStatus.COMPLETED);
    const next = await nextTriggerOf(r.id);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(SLOT.getTime());
  });

  it('UT-ACK-02 单次提醒完成 → nextTriggerAt=null', async () => {
    const r = await mkReminder({ repeatRule: { type: RepeatType.ONCE } });
    await service.ack(USER, r.id, {
      status: ReminderLogStatus.COMPLETED,
      scheduledTime: SLOT.toISOString(),
    });
    expect(await nextTriggerOf(r.id)).toBeNull();
  });

  it('UT-ACK-03 延迟 → delayed 日志带 delayMinutes，nextTriggerAt ≈ now+延迟', async () => {
    const r = await mkReminder();
    const before = Date.now();
    await service.ack(USER, r.id, {
      status: ReminderLogStatus.DELAYED,
      scheduledTime: SLOT.toISOString(),
      delayMinutes: 5,
    });
    const logs = await logsOf(r.id);
    expect(logs[0].status).toBe(ReminderLogStatus.DELAYED);
    expect(logs[0].delayMinutes).toBe(5);
    const next = await nextTriggerOf(r.id);
    expect(next!.getTime()).toBeGreaterThanOrEqual(before + 5 * 60_000 - 2000);
    expect(next!.getTime()).toBeLessThan(before + 5 * 60_000 + 30_000);
  });

  it('UT-ACK-04 拍照新槽 → photo 日志，不推进调度（独立于完成标记）', async () => {
    const r = await mkReminder();
    const stale = await nextTriggerOf(r.id);
    await service.ack(USER, r.id, {
      status: ReminderLogStatus.PHOTO,
      scheduledTime: SLOT.toISOString(),
      photoUrl: '/uploads/p1.jpg',
    });
    const logs = await logsOf(r.id);
    expect(logs[0].status).toBe(ReminderLogStatus.PHOTO);
    expect(logs[0].photoUrl).toBe('/uploads/p1.jpg');
    expect((await nextTriggerOf(r.id))!.getTime()).toBe(stale!.getTime());
  });

  // ===== B. 幂等 / 升级路径 =====

  it('UT-ACK-05 同槽重复完成 → duplicate，不重复写日志、不再推进调度', async () => {
    const r = await mkReminder();
    await service.ack(USER, r.id, {
      status: ReminderLogStatus.COMPLETED,
      scheduledTime: SLOT.toISOString(),
    });
    const afterFirst = await nextTriggerOf(r.id);
    const out = await service.ack(USER, r.id, {
      status: ReminderLogStatus.COMPLETED,
      scheduledTime: SLOT.toISOString(),
    });
    expect(out.duplicate).toBe(true);
    expect(await logsOf(r.id)).toHaveLength(1);
    expect((await nextTriggerOf(r.id))!.getTime()).toBe(afterFirst!.getTime());
  });

  it('UT-ACK-06 photo 槽重复拍照上报 → 替换照片，状态不变', async () => {
    const r = await mkReminder();
    await seedLog(r.id, ReminderLogStatus.PHOTO, SLOT, { photoUrl: '/uploads/old.jpg' });
    const out = await service.ack(USER, r.id, {
      status: ReminderLogStatus.PHOTO,
      scheduledTime: SLOT.toISOString(),
      photoUrl: '/uploads/new.jpg',
    });
    expect(out.duplicate).toBe(true);
    expect(out.replaced).toBe(true);
    const logs = await logsOf(r.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].photoUrl).toBe('/uploads/new.jpg');
    expect(logs[0].status).toBe(ReminderLogStatus.PHOTO);
  });

  it('UT-ACK-07 NOTE 槽点完成 → 就地升级 completed 并推进调度（#58/#31 回归）', async () => {
    const r = await mkReminder();
    await seedLog(r.id, ReminderLogStatus.NOTE, SLOT, { note: '随手记' });
    const out = await service.ack(USER, r.id, {
      status: ReminderLogStatus.COMPLETED,
      scheduledTime: SLOT.toISOString(),
    });
    expect(out.duplicate).toBe(true);
    expect(out.upgraded).toBe(true);
    const logs = await logsOf(r.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(ReminderLogStatus.COMPLETED);
    expect(logs[0].note).toBe('随手记');
    const next = await nextTriggerOf(r.id);
    expect(next!.getTime()).toBeGreaterThan(SLOT.getTime());
  });

  it('UT-ACK-08 PHOTO 槽点延迟 → 升级 delayed，nextTriggerAt ≈ now+延迟', async () => {
    const r = await mkReminder();
    await seedLog(r.id, ReminderLogStatus.PHOTO, SLOT, { photoUrl: '/uploads/p.jpg' });
    const before = Date.now();
    const out = await service.ack(USER, r.id, {
      status: ReminderLogStatus.DELAYED,
      scheduledTime: SLOT.toISOString(),
      delayMinutes: 10,
    });
    expect(out.upgraded).toBe(true);
    const logs = await logsOf(r.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(ReminderLogStatus.DELAYED);
    expect(logs[0].delayMinutes).toBe(10);
    expect(logs[0].photoUrl).toBe('/uploads/p.jpg');
    const next = await nextTriggerOf(r.id);
    expect(next!.getTime()).toBeGreaterThanOrEqual(before + 10 * 60_000 - 2000);
  });

  it('UT-ACK-09 延迟后按原槽完成 → delayedLanded 升级，调度以原槽为基准重排（#8 回归）', async () => {
    const r = await mkReminder();
    await seedLog(r.id, ReminderLogStatus.DELAYED, SLOT, { delayMinutes: 5 });
    const out = await service.ack(USER, r.id, {
      status: ReminderLogStatus.COMPLETED,
      scheduledTime: SLOT.toISOString(), // 详情弹窗/看板按原时刻上报
    });
    expect(out.duplicate).toBe(false);
    expect(out.upgraded).toBe(true);
    const logs = await logsOf(r.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(ReminderLogStatus.COMPLETED);
    const next = await nextTriggerOf(r.id);
    expect(next!.getTime()).toBeGreaterThan(SLOT.getTime());
    expect(next!.getTime()).toBeLessThan(SLOT.getTime() + 25 * 3600_000);
  });

  it('UT-ACK-10 错过后补完成 → missedUpgrade 升级（用药提醒扣库存）', async () => {
    const med = await dataSource.getRepository(Medicine).save(
      dataSource.getRepository(Medicine).create({
        id: 'med-ack-10',
        userId: USER,
        name: '降压药',
        stock: 10,
        threshold: 3,
        deductionPerUse: 1,
      }),
    );
    const r = await mkReminder({ category: ReminderCategory.MEDICATION, medicineId: med.id });
    await seedLog(r.id, ReminderLogStatus.MISSED, SLOT);
    const out = await service.ack(USER, r.id, {
      status: ReminderLogStatus.COMPLETED,
      scheduledTime: SLOT.toISOString(),
    });
    expect(out.upgraded).toBe(true);
    const logs = await logsOf(r.id);
    expect(logs[0].status).toBe(ReminderLogStatus.COMPLETED);
    expect(logs[0].stockDeducted).toBe(1);
    expect(logs[0].medicineNameSnapshot).toBe('降压药');
    expect((await dataSource.getRepository(Medicine).findOneByOrFail({ id: med.id })).stock).toBe(9);
  });

  it('UT-ACK-11 同槽二次延迟 → delayMinutes 以原时刻为基准累计', async () => {
    const r = await mkReminder();
    const base = new Date(Date.now() - 5 * 60_000); // 原槽 5 分钟前
    await seedLog(r.id, ReminderLogStatus.DELAYED, base, { delayMinutes: 5 });
    const before = Date.now();
    const out = await service.ack(USER, r.id, {
      status: ReminderLogStatus.DELAYED,
      scheduledTime: new Date(base.getTime() + 5 * 60_000).toISOString(), // 上报槽=原槽+首延迟
      delayMinutes: 10,
    });
    expect(out.delayed).toBe(true);
    const logs = await logsOf(r.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(ReminderLogStatus.DELAYED);
    expect(logs[0].delayMinutes).toBeGreaterThanOrEqual(15);
    expect(logs[0].delayMinutes).toBeLessThanOrEqual(16);
    const next = await nextTriggerOf(r.id);
    expect(next!.getTime()).toBeGreaterThanOrEqual(before + 10 * 60_000 - 2000);
  });

  // ===== C. 延迟槽回匹配 =====

  it('UT-DLY-01 findDelayedLogForSlot：90s 容差内匹配原槽，容差外不匹配', async () => {
    const r = await mkReminder();
    const base = new Date(Date.now() - 10 * 60_000);
    await seedLog(r.id, ReminderLogStatus.DELAYED, base, { delayMinutes: 5 });
    // 原槽 + 5min（±60s）→ 匹配
    const hit = await findDelayedLogForSlot(
      logRepo,
      r.id,
      new Date(base.getTime() + 5 * 60_000 + 60_000),
    );
    expect(hit).not.toBeNull();
    // 原槽 + 3min（差 2min > 90s）→ 不匹配
    const miss = await findDelayedLogForSlot(
      logRepo,
      r.id,
      new Date(base.getTime() + 3 * 60_000),
    );
    expect(miss).toBeNull();
  });

  it('UT-ACK-12 延迟重弹后按新槽上报 → 回匹配原槽就地升级（#7 回归）', async () => {
    const r = await mkReminder();
    const base = new Date(Date.now() - 5 * 60_000);
    await seedLog(r.id, ReminderLogStatus.DELAYED, base, { delayMinutes: 5 });
    const out = await service.ack(USER, r.id, {
      status: ReminderLogStatus.SKIPPED,
      scheduledTime: new Date(base.getTime() + 5 * 60_000).toISOString(), // 弹窗重弹时刻
    });
    expect(out.upgraded).toBe(true);
    expect(out.duplicate).toBe(false);
    const logs = await logsOf(r.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(ReminderLogStatus.SKIPPED);
    const next = await nextTriggerOf(r.id);
    expect(next!.getTime()).toBeGreaterThan(base.getTime());
  });

  // ===== D. 库存联动 =====

  it('UT-ACK-13 用药提醒完成 → 扣库存 + 写药名快照；低于阈值触发预警', async () => {
    const med = await dataSource.getRepository(Medicine).save(
      dataSource.getRepository(Medicine).create({
        id: 'med-ack-13',
        userId: USER,
        name: '降糖药',
        stock: 4,
        threshold: 3,
        deductionPerUse: 1,
      }),
    );
    const r = await mkReminder({ category: ReminderCategory.MEDICATION, medicineId: med.id });
    await service.ack(USER, r.id, {
      status: ReminderLogStatus.CHALLENGE_COMPLETED,
      scheduledTime: SLOT.toISOString(),
    });
    expect((await dataSource.getRepository(Medicine).findOneByOrFail({ id: med.id })).stock).toBe(3);
    const logs = await logsOf(r.id);
    expect(logs[0].status).toBe(ReminderLogStatus.CHALLENGE_COMPLETED);
    expect(logs[0].stockDeducted).toBe(1);
    const notifs = await dataSource.getRepository(Notification).find({ where: { userId: USER } });
    expect(notifs.some((n) => n.type === 'low_stock')).toBe(true);
  });

  it('UT-ACK-14 库存不足 → STOCK_EXCEEDED，事务回滚（日志不落库、库存不变）', async () => {
    const med = await dataSource.getRepository(Medicine).save(
      dataSource.getRepository(Medicine).create({
        id: 'med-ack-14',
        userId: USER,
        name: '空瓶药',
        stock: 0,
        threshold: 3,
        deductionPerUse: 1,
      }),
    );
    const r = await mkReminder({ category: ReminderCategory.MEDICATION, medicineId: med.id });
    await expect(
      service.ack(USER, r.id, {
        status: ReminderLogStatus.COMPLETED,
        scheduledTime: SLOT.toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await logsOf(r.id)).toHaveLength(0);
    expect((await dataSource.getRepository(Medicine).findOneByOrFail({ id: med.id })).stock).toBe(0);
  });

  // ===== E. 留言 / 喝水 / 延迟输入校验 =====

  it('UT-NOTE-01 空槽留言 → 新建 NOTE 日志，不改调度', async () => {
    const r = await mkReminder();
    const stale = await nextTriggerOf(r.id);
    const out = await service.upsertNote(USER, r.id, SLOT.toISOString(), '饭后再吃');
    expect(out.ok).toBe(true);
    const logs = await logsOf(r.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(ReminderLogStatus.NOTE);
    expect(logs[0].note).toBe('饭后再吃');
    expect((await nextTriggerOf(r.id))!.getTime()).toBe(stale!.getTime());
  });

  it('UT-NOTE-02 已完成槽留言 → 只更新 note，状态保留', async () => {
    const r = await mkReminder();
    await seedLog(r.id, ReminderLogStatus.COMPLETED, SLOT);
    await service.upsertNote(USER, r.id, SLOT.toISOString(), '已确认服用');
    const logs = await logsOf(r.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(ReminderLogStatus.COMPLETED);
    expect(logs[0].note).toBe('已确认服用');
  });

  it('UT-NOTE-03 空留言 / 超 500 字 → VALIDATION_FAILED', async () => {
    const r = await mkReminder();
    await expect(service.upsertNote(USER, r.id, SLOT.toISOString(), '   ')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.upsertNote(USER, r.id, SLOT.toISOString(), 'a'.repeat(501))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('UT-WAT-01 喝水手动记录 → manual 日志 amount=200；非法值 400', async () => {
    const log = await service.waterLog(USER, 200);
    expect(log.status).toBe(ReminderLogStatus.MANUAL);
    expect(log.amount).toBe(200);
    expect(log.category).toBe('water');
    await expect(service.waterLog(USER, 0)).rejects.toThrow(BadRequestException);
    await expect(service.waterLog(USER, 5001)).rejects.toThrow(BadRequestException);
    await expect(service.waterLog(USER, 2.5)).rejects.toThrow(BadRequestException);
  });

  it('UT-ACK-15 delay()：无待触发 → NOT_SCHEDULED；分钟非法 → VALIDATION_FAILED', async () => {
    const r = await mkReminder({ nextTriggerAt: null });
    await expect(service.delay(USER, r.id, 5)).rejects.toThrow(BadRequestException);
    const r2 = await mkReminder();
    await expect(service.delay(USER, r2.id, 0)).rejects.toThrow(BadRequestException);
    await expect(service.delay(USER, r2.id, 1441)).rejects.toThrow(BadRequestException);
    await expect(service.delay(USER, r2.id, 2.5)).rejects.toThrow(BadRequestException);
  });

  it('UT-ACK-16 替换照片：空串 = 删除照片（photoUrl 清空，记录保留）', async () => {
    const r = await mkReminder();
    await seedLog(r.id, ReminderLogStatus.PHOTO, SLOT, { photoUrl: '/uploads/p.jpg' });
    const out = await service.replaceLogPhoto(USER, (await logsOf(r.id))[0].id, '');
    expect(out.ok).toBe(true);
    expect((await logsOf(r.id))[0].photoUrl).toBe('');
  });
});
