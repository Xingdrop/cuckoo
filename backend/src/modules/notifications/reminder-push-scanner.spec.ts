import { Test } from '@nestjs/testing';
import { ReminderPushScanner } from './reminder-push-scanner';
import { PushService } from './push.service';
import { Reminder } from '../reminders/reminder.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { NotificationLog } from './notification-log.entity';
import { UserSetting } from '../users/user-setting.entity';

describe('ReminderPushScanner（通道 B 到期推送）', () => {
  let scanner: ReminderPushScanner;
  let reminderRepo: { find: jest.Mock };
  let logRepo: { findOne: jest.Mock };
  let notifLogRepo: {
    findOne: jest.Mock;
    create: (x: unknown) => unknown;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let settingRepo: { find: jest.Mock };
  let sendToUser: jest.Mock;

  const NOW = new Date('2026-08-29T10:00:00Z');

  const makeReminder = (over = {}) =>
    ({
      id: 'r1',
      userId: 'u1',
      title: '喝水',
      isActive: true,
      nextTriggerAt: new Date('2026-08-29T09:55:00Z'),
      medicineId: null,
      ...over,
    }) as Reminder;

  beforeEach(async () => {
    sendToUser = jest.fn().mockResolvedValue({ sent: 1, skipped: false });
    reminderRepo = { find: jest.fn() };
    logRepo = { findOne: jest.fn() };
    notifLogRepo = {
      findOne: jest.fn(),
      create: (x: unknown) => x,
      save: jest.fn().mockImplementation(async (x: unknown) => x),
      delete: jest.fn(),
    };
    settingRepo = { find: jest.fn().mockResolvedValue([]) };

    const module = await Test.createTestingModule({
      providers: [
        ReminderPushScanner,
        { provide: 'ReminderRepository', useValue: reminderRepo },
        { provide: 'ReminderLogRepository', useValue: logRepo },
        { provide: 'NotificationLogRepository', useValue: notifLogRepo },
        { provide: 'UserSettingRepository', useValue: settingRepo },
        { provide: PushService, useValue: { sendToUser } },
      ],
    }).compile();
    scanner = module.get(ReminderPushScanner);
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => jest.useRealTimers());

  it('到期未响应 + 未推送过 → 写发送记录并推送', async () => {
    reminderRepo.find.mockResolvedValue([makeReminder()]);
    logRepo.findOne.mockResolvedValue(null); // 本地通道未响应
    notifLogRepo.findOne.mockResolvedValue(null); // 未推送过

    await scanner.scan();

    expect(sendToUser).toHaveBeenCalledWith('u1', {
      title: '提醒时间到',
      body: '「喝水」现在开始',
      url: '/today',
    });
    expect(notifLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ dedupKey: `push:reminder:r1:${makeReminder().nextTriggerAt!.getTime()}` }),
    );
  });

  it('本地通道已响应（完成/延迟/跳过）→ 不推送', async () => {
    reminderRepo.find.mockResolvedValue([makeReminder()]);
    logRepo.findOne.mockResolvedValue({ id: 'log1' }); // 已有响应

    await scanner.scan();

    expect(sendToUser).not.toHaveBeenCalled();
    expect(notifLogRepo.save).not.toHaveBeenCalled();
  });

  it('已推送过（dedupKey 命中）→ 不重复推送', async () => {
    reminderRepo.find.mockResolvedValue([makeReminder()]);
    logRepo.findOne.mockResolvedValue(null);
    notifLogRepo.findOne.mockResolvedValue({ id: 'log1', dedupKey: 'x' }); // 已推送

    await scanner.scan();

    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('用户关闭通知（notificationEnabled=false）→ 不推送', async () => {
    reminderRepo.find.mockResolvedValue([makeReminder()]);
    settingRepo.find.mockResolvedValue([{ userId: 'u1', notificationEnabled: false } as UserSetting]);

    await scanner.scan();

    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('VAPID 未配置（skipped）→ 删除占位记录，待重试', async () => {
    reminderRepo.find.mockResolvedValue([makeReminder()]);
    sendToUser.mockResolvedValue({ sent: 0, skipped: true });

    await scanner.scan();

    expect(notifLogRepo.save).toHaveBeenCalledTimes(1);
    expect(notifLogRepo.delete).toHaveBeenCalledWith({
      dedupKey: `push:reminder:r1:${makeReminder().nextTriggerAt!.getTime()}`,
    });
  });

  it('超出 10 分钟窗口的提醒不扫描（交给漏服扫描）', async () => {
    reminderRepo.find.mockResolvedValue([]); // 窗口外不会命中查询

    await scanner.scan();

    expect(sendToUser).not.toHaveBeenCalled();
  });
});
