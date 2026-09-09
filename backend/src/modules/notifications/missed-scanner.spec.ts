/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9ub3RpZmljYXRpb25zL21pc3NlZC1zY2FubmVyLnNwZWMudHN8MjAyNi0wOXxhNzUyNWM0NTE2 */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MissedScanner } from './missed-scanner';
import { PushService } from './push.service';
import { Reminder } from '../reminders/reminder.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { Notification } from './notification.entity';
import { NotificationLog } from './notification-log.entity';
import { EmergencyContact } from '../contacts/emergency-contact.entity';
import { UserSetting } from '../users/user-setting.entity';

/** 漏服扫描单测（UT-MISS-01~07，mock 方式，fake timers 固定 now）。 */
describe('MissedScanner（UT-MISS）', () => {
  let scanner: MissedScanner;
  let reminderRepo: { find: jest.Mock };
  let logRepo: { findOne: jest.Mock; find: jest.Mock; create: (x: unknown) => unknown; save: jest.Mock; update: jest.Mock };
  let notifRepo: { save: jest.Mock; create: (x: unknown) => unknown };
  let notifLogRepo: { findOne: jest.Mock; create: (x: unknown) => unknown; save: jest.Mock };
  let contactRepo: { find: jest.Mock };
  let settingRepo: { find: jest.Mock };
  let sendToUser: jest.Mock;

  const NOW = new Date('2026-08-29T10:00:00Z');
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

  const makeReminder = (over = {}) =>
    ({
      id: 'r1',
      userId: 'u1',
      title: '喝水',
      isActive: true,
      nextTriggerAt: minutesAgo(40),
      medicineId: null,
      category: 'water',
      times: ['09:00'],
      repeatRule: { type: 'daily' },
      ...over,
    }) as Reminder;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);

    sendToUser = jest.fn().mockResolvedValue({ sent: 1, skipped: false });
    reminderRepo = { find: jest.fn().mockResolvedValue([]) };
    logRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      // #7：延迟槽匹配查询（findDelayedLogForSlot）——默认无 delayed 日志 → 走新建 missed 路径
      find: jest.fn().mockResolvedValue([]),
      create: (x: unknown) => x,
      save: jest.fn().mockImplementation(async (x: unknown) => x),
      update: jest.fn().mockResolvedValue(undefined),
    };
    notifRepo = { save: jest.fn().mockImplementation(async (x: unknown) => x), create: (x: unknown) => x };
    notifLogRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: (x: unknown) => x,
      save: jest.fn().mockImplementation(async (x: unknown) => x),
    };
    contactRepo = { find: jest.fn().mockResolvedValue([]) };
    settingRepo = { find: jest.fn().mockResolvedValue([]) };

    const module = await Test.createTestingModule({
      providers: [
        MissedScanner,
        { provide: getRepositoryToken(Reminder), useValue: reminderRepo },
        { provide: getRepositoryToken(ReminderLog), useValue: logRepo },
        { provide: getRepositoryToken(Notification), useValue: notifRepo },
        { provide: getRepositoryToken(NotificationLog), useValue: notifLogRepo },
        { provide: getRepositoryToken(EmergencyContact), useValue: contactRepo },
        { provide: getRepositoryToken(UserSetting), useValue: settingRepo },
        { provide: PushService, useValue: { sendToUser } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        // 2026-09-07：scanner 新增 DataSource（亲友用户查询 getRepository(User)）
        { provide: DataSource, useValue: { getRepository: jest.fn().mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) }) } },
      ],
    }).compile();
    scanner = module.get(MissedScanner);
  });

  afterEach(() => jest.useRealTimers());

  it('UT-MISS-01 超时未响应 → 写 missed 日志 + 本人通知 + 推送 + 亲友通知', async () => {
    reminderRepo.find.mockResolvedValue([makeReminder()]); // nextTriggerAt = now-40min
    settingRepo.find.mockResolvedValue([{ userId: 'u1', missedThresholdMinutes: 30 } as UserSetting]);
    contactRepo.find.mockResolvedValue([
      { id: 'c1', userId: 'u1', appUserId: 'u2', receiveMissed: true } as EmergencyContact,
    ]);

    await scanner.scan();

    // missed 日志
    expect(logRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reminderId: 'r1', userId: 'u1', status: 'missed' }),
    );
    // 本人站内通知
    expect(notifRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', type: 'missed', content: '「喝水」已超时未完成' }),
    );
    // 本人推送
    expect(sendToUser).toHaveBeenCalledWith('u1', {
      title: '提醒已错过',
      body: '「喝水」已超时未完成',
      url: '/today',
    });
    // 亲友通知（content 带「你的亲友」）
    expect(notifRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', content: expect.stringContaining('你的亲友') }),
    );
    // 亲友去重日志
    expect(notifLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u2',
        dedupKey: `missed:r1:${makeReminder().nextTriggerAt!.getTime()}:u2`,
      }),
    );
    // 按 receiveMissed=true 查亲友
    expect(contactRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ receiveMissed: true }) }),
    );
  });

  it('UT-MISS-02 阈值内（nextTriggerAt = now-10min）→ 不判定', async () => {
    reminderRepo.find.mockResolvedValue([makeReminder({ nextTriggerAt: minutesAgo(10) })]);
    settingRepo.find.mockResolvedValue([{ userId: 'u1', missedThresholdMinutes: 30 } as UserSetting]);

    await scanner.scan();

    expect(logRepo.save).not.toHaveBeenCalled();
    expect(notifRepo.save).not.toHaveBeenCalled();
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('UT-MISS-03 已响应（logRepo.findOne 有值）→ 跳过', async () => {
    reminderRepo.find.mockResolvedValue([makeReminder()]);
    logRepo.findOne.mockResolvedValue({ id: 'log1', status: 'delayed' });

    await scanner.scan();

    expect(logRepo.save).not.toHaveBeenCalled();
    expect(notifRepo.save).not.toHaveBeenCalled();
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('UT-MISS-04 已跳过/完成 → 同上不判定', async () => {
    reminderRepo.find.mockResolvedValue([makeReminder()]);
    logRepo.findOne.mockResolvedValue({ id: 'log2', status: 'completed' });

    await scanner.scan();

    expect(logRepo.save).not.toHaveBeenCalled();
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('UT-MISS-05 重复扫描幂等（dedupKey 命中）→ 不再发亲友通知', async () => {
    reminderRepo.find.mockResolvedValue([makeReminder()]);
    settingRepo.find.mockResolvedValue([{ userId: 'u1', missedThresholdMinutes: 30 } as UserSetting]);
    contactRepo.find.mockResolvedValue([
      { id: 'c1', userId: 'u1', appUserId: 'u2', receiveMissed: true } as EmergencyContact,
    ]);
    // dedupKey 命中 → 亲友已通知过
    notifLogRepo.findOne.mockResolvedValue({ id: 'nl1', dedupKey: `missed:r1:${makeReminder().nextTriggerAt!.getTime()}:u2` });

    await scanner.scan();

    // 本人仍被标记/通知
    expect(notifRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', type: 'missed' }),
    );
    // 亲友不再重复通知（不写亲友通知与去重日志）
    expect(notifRepo.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('你的亲友') }),
    );
    expect(notifLogRepo.save).not.toHaveBeenCalled();
  });

  it('UT-MISS-06 亲友 receiveMissed=false → 只通知本人', async () => {
    reminderRepo.find.mockResolvedValue([makeReminder()]);
    settingRepo.find.mockResolvedValue([{ userId: 'u1', missedThresholdMinutes: 30 } as UserSetting]);
    // receiveMissed=false 的联系人被 WHERE 过滤掉（查询只取 receiveMissed=true）
    contactRepo.find.mockResolvedValue([]);

    await scanner.scan();

    expect(sendToUser).toHaveBeenCalledWith('u1', expect.anything());
    expect(notifRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', type: 'missed' }),
    );
    // 无亲友通知
    expect(notifRepo.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('你的亲友') }),
    );
    expect(contactRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ receiveMissed: true }) }),
    );
  });

  it('UT-MISS-07 用户级阈值：missedThresholdMinutes=10 → 10 分钟前算漏服', async () => {
    reminderRepo.find.mockResolvedValue([makeReminder({ nextTriggerAt: minutesAgo(11) })]);
    // 用户级阈值 10 分钟（默认 30 时 11 分钟不会判漏服）
    settingRepo.find.mockResolvedValue([{ userId: 'u1', missedThresholdMinutes: 10 } as UserSetting]);

    await scanner.scan();

    expect(logRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ reminderId: 'r1', status: 'missed' }),
    );
    expect(sendToUser).toHaveBeenCalledWith('u1', expect.anything());
  });

  it('UT-MISS-08 #7 延迟重弹未处理：原槽 delayed 日志就地升级 missed（不造幻影槽）', async () => {
    // 原槽 09:20 延迟 5 分钟 → 新时刻 09:25 = nextTriggerAt（now-40min 之外的语义由 mock 决定）
    reminderRepo.find.mockResolvedValue([makeReminder()]);
    settingRepo.find.mockResolvedValue([{ userId: 'u1', missedThresholdMinutes: 30 } as UserSetting]);
    // 延迟槽匹配命中：原槽 = next - 5min，delayMinutes=5
    const delayedLog = {
      id: 'dlog1',
      reminderId: 'r1',
      scheduledTime: minutesAgo(45),
      delayMinutes: 5,
      status: 'delayed',
    };
    logRepo.find.mockResolvedValue([delayedLog]);

    await scanner.scan();

    // 就地 update 原槽日志为 missed，不再 save 新槽
    expect(logRepo.update).toHaveBeenCalledWith(
      { id: 'dlog1' },
      expect.objectContaining({ status: 'missed' }),
    );
    expect(logRepo.save).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'missed' }));
    // 调度推进与通知照常
    expect(sendToUser).toHaveBeenCalledWith('u1', expect.anything());
  });
});
