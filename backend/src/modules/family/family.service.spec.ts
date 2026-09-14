/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9mYW1pbHkvZmFtaWx5LnNlcnZpY2Uuc3BlYy50c3wyMDI2LTA5fDRhNzJhYTRiY2U= */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FamilyService } from './family.service';
import { FamilyBinding, FamilyBindingStatus } from './family-binding.entity';
import { FamilyInvite } from './family-invite.entity';
import { ChatMessage } from './chat-message.entity';
import { User } from '../users/user.entity';
import { UserSetting } from '../users/user-setting.entity';
import { Medicine } from '../medicines/medicine.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { SensitiveWord } from '../social/sensitive-word.entity';
import { Notification } from '../notifications/notification.entity';
import { RemindersService } from '../reminders/reminders.service';

/** 亲友绑定单测（UT-FAM：邀请码/审批/越权/解绑/摘要/聊天/未读） */
describe('FamilyService（UT-FAM）', () => {
  let service: FamilyService;
  let inviteRepo: { delete: jest.Mock; findOne: jest.Mock; create: (x: unknown) => unknown; save: jest.Mock };
  let bindingRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
    create: (x: unknown) => unknown;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let messageRepo: {
    find: jest.Mock;
    count: jest.Mock;
    create: (x: unknown) => unknown;
    save: jest.Mock;
    update: jest.Mock;
  };
  let userRepo: { findOne: jest.Mock };
  let notifRepo: { findOne: jest.Mock; create: (x: unknown) => unknown; save: jest.Mock };
  let remindersService: { getUserTimezoneSafe: jest.Mock; dayPlan: jest.Mock };

  const makeBinding = (over = {}) =>
    ({
      id: 'b1',
      userAId: 'A',
      userBId: 'B',
      status: FamilyBindingStatus.ACTIVE,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      ...over,
    }) as never;

  beforeEach(async () => {
    // mock create 模拟 TypeORM 填充默认列（@PrimaryColumn/@CreateDateColumn）
    const createWithDefaults =
      (defaults: object) =>
      (x: unknown) =>
        ({ ...defaults, ...(x as object) }) as unknown;
    inviteRepo = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn().mockResolvedValue(null),
      create: createWithDefaults({ id: 'inv-1', createdAt: new Date() }),
      save: jest.fn().mockImplementation(async (x: unknown) => x),
    };
    bindingRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: createWithDefaults({ id: 'bind-1', createdAt: new Date() }),
      save: jest.fn().mockImplementation(async (x: unknown) => x),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    messageRepo = {
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: createWithDefaults({ id: 'msg-1', createdAt: new Date() }),
      save: jest.fn().mockImplementation(async (x: unknown) => x),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    userRepo = {
      findOne: jest.fn().mockImplementation(async (opts: unknown) => {
        const id = (opts as { where: { id: string } }).where.id;
        return { id, username: `user-${id}`, avatarUrl: null };
      }),
    };
    notifRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: createWithDefaults({ id: 'n-1' }),
      save: jest.fn().mockImplementation(async (x: unknown) => x),
    };
    remindersService = {
      getUserTimezoneSafe: jest.fn().mockResolvedValue('Asia/Shanghai'),
      dayPlan: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      providers: [
        FamilyService,
        { provide: getRepositoryToken(FamilyInvite), useValue: inviteRepo },
        { provide: getRepositoryToken(FamilyBinding), useValue: bindingRepo },
        { provide: getRepositoryToken(ChatMessage), useValue: messageRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(UserSetting), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(Medicine), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(ReminderLog), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(SensitiveWord), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(Notification), useValue: notifRepo },
        { provide: RemindersService, useValue: remindersService },
      ],
    }).compile();
    service = module.get(FamilyService);
  });

  describe('UT-FAM-01 邀请码', () => {
    it('生成邀请码：6 位、旧码作废、24h 有效', async () => {
      const res = await service.createInvite('A');
      expect(res.code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
      expect(inviteRepo.delete).toHaveBeenCalledWith({ userId: 'A' });
      expect(res.expiresAt.length).toBeGreaterThan(0);
    });

    it('getMyInvite：无码返回 null；未过期返回码', async () => {
      expect(await service.getMyInvite('A')).toEqual({ code: null, expiresAt: null });
      inviteRepo.findOne.mockResolvedValue({
        code: 'ABC234',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const res = await service.getMyInvite('A');
      expect(res.code).toBe('ABC234');
    });
  });

  describe('UT-FAM-02 绑定流', () => {
    it('凭码申请：创建 pending（userA=码主）+ 消费邀请码 + 通知对方', async () => {
      inviteRepo.findOne.mockResolvedValue({
        id: 'i1',
        userId: 'A',
        code: 'ABC234',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const res = await service.bindByCode('B', 'ABC234');
      expect(res.status).toBe(FamilyBindingStatus.PENDING);
      expect(inviteRepo.delete).toHaveBeenCalledWith({ id: 'i1' });
      expect(notifRepo.save).toHaveBeenCalled();
    });

    it('不能绑定自己 / 无效码 / 重复绑定', async () => {
      inviteRepo.findOne.mockImplementation(async (opts: unknown) => {
        const code = (opts as { where: { code: string } }).where.code;
        return code === 'ABC234'
          ? { id: 'i1', userId: 'A', code, expiresAt: new Date(Date.now() + 60_000) }
          : null;
      });
      await expect(service.bindByCode('A', 'ABC234')).rejects.toThrow(BadRequestException);
      await expect(service.bindByCode('B', 'ZZZZZZ')).rejects.toThrow(NotFoundException);
      bindingRepo.findOne.mockResolvedValue(makeBinding({ status: FamilyBindingStatus.PENDING }));
      await expect(service.bindByCode('B', 'ABC234')).rejects.toThrow(BadRequestException);
    });

    it('审批：仅码主（userA）可同意；同意后 active 并通知申请人', async () => {
      bindingRepo.findOne.mockResolvedValue(makeBinding({ status: FamilyBindingStatus.PENDING }));
      await expect(service.respondBinding('B', 'b1', true)).rejects.toThrow(ForbiddenException);
      const res = await service.respondBinding('A', 'b1', true);
      expect(res.status).toBe(FamilyBindingStatus.ACTIVE);
      expect(bindingRepo.update).toHaveBeenCalled();
      expect(notifRepo.save).toHaveBeenCalled();
    });

    it('拒绝：删除 pending 绑定', async () => {
      bindingRepo.findOne.mockResolvedValue(makeBinding({ status: FamilyBindingStatus.PENDING }));
      const res = await service.respondBinding('A', 'b1', false);
      expect(res.status).toBeNull();
      expect(bindingRepo.delete).toHaveBeenCalled();
    });

    it('解绑：双方均可（userB 也能解）+ 通知对方', async () => {
      bindingRepo.findOne.mockResolvedValue(makeBinding());
      await service.unbind('B', 'b1');
      expect(bindingRepo.delete).toHaveBeenCalledWith({ id: 'b1' });
      expect(notifRepo.save).toHaveBeenCalled();
    });
  });

  describe('UT-FAM-03 越权与摘要', () => {
    it('非绑定成员访问摘要/消息 → 403', async () => {
      bindingRepo.findOne.mockResolvedValue(makeBinding());
      await expect(service.getPartnerSummary('X', 'b1')).rejects.toThrow(ForbiddenException);
      await expect(service.getMessages('X', 'b1')).rejects.toThrow(ForbiddenException);
    });

    it('pending 绑定不能查看摘要（activeOnly）', async () => {
      bindingRepo.findOne.mockResolvedValue(makeBinding({ status: FamilyBindingStatus.PENDING }));
      await expect(service.getPartnerSummary('B', 'b1')).rejects.toThrow(ForbiddenException);
    });

    it('摘要：完成率口径与看板一致（跳过不计分母）+ 药品库存返回', async () => {
      bindingRepo.findOne.mockResolvedValue(makeBinding());
      remindersService.dayPlan.mockResolvedValue([
        {
          reminderId: 'r1',
          title: '吃药',
          category: 'medication',
          categoryLabel: null,
          categoryIcon: null,
          countInRate: true,
          times: [
            { time: '08:00', status: 'completed' },
            { time: '20:00', status: null },
          ],
        },
        {
          reminderId: 'r2',
          title: '拉伸',
          category: 'exercise',
          categoryLabel: null,
          categoryIcon: null,
          countInRate: true,
          times: [{ time: '12:00', status: 'skipped' }],
        },
      ]);
      const res = await service.getPartnerSummary('B', 'b1');
      expect(res.summary.planned).toBe(2); // completed + 未响应（skipped 不计）
      expect(res.summary.done).toBe(1);
      expect(res.summary.rate).toBe(50);
      expect(res.partner.id).toBe('A');
      expect(res.reminders[0].times[0].status).toBe('completed');
    });
  });

  describe('UT-FAM-04 聊天', () => {
    it('发送：空消息拒绝；非法图片地址拒绝；返回 mine=true', async () => {
      bindingRepo.findOne.mockResolvedValue(makeBinding());
      await expect(service.sendMessage('A', 'b1', '  ', null)).rejects.toThrow(BadRequestException);
      await expect(service.sendMessage('A', 'b1', 'hi', 'http://evil.com/x.jpg')).rejects.toThrow(BadRequestException);
      const res = await service.sendMessage('A', 'b1', '记得吃药', null);
      expect(res.mine).toBe(true);
      expect(res.content).toBe('记得吃药');
    });

    it('拉取消息：正序返回；对方消息置已读；未读数只统计对方发来的', async () => {
      bindingRepo.findOne.mockResolvedValue(makeBinding());
      messageRepo.find.mockResolvedValue([
        { id: 'm2', senderId: 'A', content: 'a', photoUrl: null, createdAt: new Date('2026-09-01T01:00:00Z') },
        { id: 'm1', senderId: 'B', content: 'b', photoUrl: null, createdAt: new Date('2026-09-01T00:00:00Z') },
      ]);
      const res = await service.getMessages('A', 'b1');
      expect(res.items.map((x) => x.id)).toEqual(['m1', 'm2']); // 正序
      expect(messageRepo.update).toHaveBeenCalled(); // 已读置位
      const unread = await service.unreadCount('A');
      expect(unread.count).toBe(0);
    });
  });
});
