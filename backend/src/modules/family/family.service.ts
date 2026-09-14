/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9mYW1pbHkvZmFtaWx5LnNlcnZpY2UudHN8MjAyNi0wOXwxNzJmM2UwMTlh */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt, randomUUID } from 'node:crypto';
import { Between, In, IsNull, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { filterSensitiveWords } from '../../common/sensitive-words';
import { User } from '../users/user.entity';
import { UserSetting } from '../users/user-setting.entity';
import { Medicine } from '../medicines/medicine.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { RemindersService } from '../reminders/reminders.service';
import { SensitiveWord } from '../social/sensitive-word.entity';
import { Notification, NotificationType } from '../notifications/notification.entity';
import { FamilyBinding, FamilyBindingStatus } from './family-binding.entity';
import { FamilyInvite } from './family-invite.entity';
import { ChatMessage } from './chat-message.entity';
import { localToUtc as scheduleLocalToUtc, toLocal as scheduleToLocal } from '../../common/reminder-schedule';

/** 邀请码字母表：去掉易混淆的 0/O/1/I/L */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
/** 最多绑定人数（防滥用；健康摘要属于强信任关系） */
export const MAX_BINDINGS = 5;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/**
 * 亲友绑定（FR-306/310~313）：
 * 邀请码 + 同意制绑定 → 双向只读健康摘要（完成情况/文字照片/药品库存）+ 简易聊天 → 任一方可解绑。
 */
@Injectable()
export class FamilyService {
  private sensitiveWordsCache: string[] | null = null;

  constructor(
    @InjectRepository(FamilyInvite)
    private readonly inviteRepo: Repository<FamilyInvite>,
    @InjectRepository(FamilyBinding)
    private readonly bindingRepo: Repository<FamilyBinding>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly settingRepo: Repository<UserSetting>,
    @InjectRepository(Medicine)
    private readonly medicineRepo: Repository<Medicine>,
    @InjectRepository(ReminderLog)
    private readonly logRepo: Repository<ReminderLog>,
    @InjectRepository(SensitiveWord)
    private readonly sensitiveWordRepo: Repository<SensitiveWord>,
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    private readonly remindersService: RemindersService,
  ) {}

  // ============ 邀请码 ============

  /** 生成/刷新我的邀请码（旧码作废），24h 有效 */
  async createInvite(userId: string) {
    await this.inviteRepo.delete({ userId });
    const invite = this.inviteRepo.create({
      id: randomUUID(),
      userId,
      code: generateCode(),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
    await this.inviteRepo.save(invite);
    return { code: invite.code, expiresAt: invite.expiresAt.toISOString() };
  }

  /** 当前有效邀请码（无/过期 → null） */
  async getMyInvite(userId: string) {
    const invite = await this.inviteRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (!invite || invite.expiresAt.getTime() <= Date.now()) return { code: null, expiresAt: null };
    return { code: invite.code, expiresAt: invite.expiresAt.toISOString() };
  }

  // ============ 绑定 ============

  /** 凭邀请码申请绑定（一次性消费邀请码；对方审批后生效） */
  async bindByCode(userId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (code.length !== CODE_LENGTH) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '邀请码格式不正确' });
    }
    const invite = await this.inviteRepo.findOne({ where: { code } });
    if (!invite || invite.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '邀请码无效或已过期' });
    }
    if (invite.userId === userId) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '不能绑定自己' });
    }
    const ownerCount = await this.bindingRepo.count({
      where: [{ userAId: userId }, { userBId: userId }],
    });
    if (ownerCount >= MAX_BINDINGS) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: `最多绑定 ${MAX_BINDINGS} 位亲友` });
    }
    const ownerCount2 = await this.bindingRepo.count({ where: { userAId: invite.userId } });
    if (ownerCount2 >= MAX_BINDINGS) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '对方绑定的亲友已达上限' });
    }
    // 防重复：任一方向已存在（含待审批）即拒绝
    const existing = await this.bindingRepo.findOne({
      where: [
        { userAId: invite.userId, userBId: userId },
        { userAId: userId, userBId: invite.userId },
      ],
    });
    if (existing) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: existing.status === FamilyBindingStatus.ACTIVE ? '你们已是亲友' : '已有一条待处理的绑定申请',
      });
    }

    const binding = await this.bindingRepo.save(
      this.bindingRepo.create({
        id: randomUUID(),
        userAId: invite.userId,
        userBId: userId,
        status: FamilyBindingStatus.PENDING,
      }),
    );
    await this.inviteRepo.delete({ id: invite.id }); // 一次性消费
    await this.notify(invite.userId, '亲友绑定申请', '有人通过你的邀请码申请绑定，请到「设置 → 亲友」处理', '/family');
    return this.toBindingDto(binding, userId);
  }

  /** 我的绑定列表（含待我审批的申请） */
  async listBindings(userId: string) {
    const bindings = await this.bindingRepo.find({
      where: [{ userAId: userId }, { userBId: userId }],
      order: { createdAt: 'DESC' },
    });
    const out = [];
    for (const b of bindings) {
      const dto = await this.toBindingDto(b, userId);
      out.push(dto);
    }
    return out;
  }

  /** 审批绑定申请（仅邀请码属主 userA 可操作） */
  async respondBinding(userId: string, bindingId: string, approve: boolean) {
    const binding = await this.bindingRepo.findOne({ where: { id: bindingId } });
    if (!binding) throw new NotFoundException({ code: 'NOT_FOUND', message: '绑定申请不存在' });
    if (binding.userAId !== userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: '只有邀请码属主可以处理该申请' });
    }
    if (binding.status !== FamilyBindingStatus.PENDING) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '该申请已处理' });
    }
    if (approve) {
      // 规约：update 而非 save（transformer 陷阱）；updatedAt 手动维护（update 不触发 @UpdateDateColumn）
      await this.bindingRepo.update(
        { id: binding.id, userAId: userId, status: FamilyBindingStatus.PENDING },
        { status: FamilyBindingStatus.ACTIVE, updatedAt: new Date() },
      );
      await this.notify(binding.userBId, '亲友绑定成功', '你们已成为亲友，可以查看彼此的健康摘要并聊天了', '/family');
    } else {
      await this.bindingRepo.delete({ id: binding.id, userAId: userId, status: FamilyBindingStatus.PENDING });
    }
    return { success: true, status: approve ? FamilyBindingStatus.ACTIVE : null };
  }

  /** 解除绑定（双方均可，即时生效；聊天记录保留但不可再访问） */
  async unbind(userId: string, bindingId: string) {
    const binding = await this.getBindingForMember(userId, bindingId);
    await this.bindingRepo.delete({ id: binding.id });
    const peerId = binding.userAId === userId ? binding.userBId : binding.userAId;
    await this.notify(peerId, '亲友绑定已解除', '对方解除了与你的亲友绑定', '/family');
    return { success: true };
  }

  // ============ 健康摘要（只读） ============

  /**
   * 对方某日健康摘要：完成率口径与本人看板一致（复用 dayPlan；跳过不计分母；
   * 喝水达标可选计入）+ 当日文字/照片记录 + 药品库存（用户决策：库存可见）。
   */
  async getPartnerSummary(viewerId: string, bindingId: string, dateStr?: string) {
    const binding = await this.getBindingForMember(viewerId, bindingId, true);
    const partnerId = binding.userAId === viewerId ? binding.userBId : binding.userAId;

    const tz = await this.remindersService.getUserTimezoneSafe(partnerId);
    let y: number, m: number, d: number;
    if (dateStr) {
      const parts = dateStr.split('-').map(Number);
      if (!parts[0] || !parts[1] || !parts[2] || dateStr.length !== 10) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '日期格式须为 YYYY-MM-DD' });
      }
      [y, m, d] = parts;
    } else {
      const local = scheduleToLocal(new Date(), tz);
      y = local.year;
      m = local.month;
      d = local.day;
    }
    const resolved = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    const plan = await this.remindersService.dayPlan(partnerId, resolved);
    let planned = 0;
    let done = 0;
    let missed = 0;
    for (const item of plan) {
      if (item.countInRate === false) continue;
      for (const t of item.times) {
        if (t.status !== 'skipped') planned += 1;
        if (t.status === 'completed' || t.status === 'challenge_completed') done += 1;
        if (t.status === 'missed') missed += 1;
      }
    }
    const setting = await this.settingRepo.findOne({ where: { userId: partnerId } });
    const dayStart = scheduleLocalToUtc(tz, y, m, d, 0, 0);
    const nextDay = scheduleLocalToUtc(tz, y, m, d + 1, 0, 0);
    const waterLogs = await this.logRepo.find({
      where: { userId: partnerId, category: 'water', scheduledTime: Between(dayStart, nextDay) },
    });
    const waterMl = waterLogs.reduce((sum, l) => sum + l.amount, 0);
    const waterGoalMl = setting?.waterGoalMl ?? 2000;
    let rate = planned > 0 ? Math.round((done / planned) * 100) : done > 0 ? 100 : 0;
    if (setting?.waterCountInRate === true && waterGoalMl > 0 && waterMl >= waterGoalMl) {
      done += 1;
      if (planned === 0) planned = 1;
      rate = Math.round((done / planned) * 100);
    }

    // 当日日志（照片/时间）——按 reminderId + 本地 HH:mm 关联到计划槽位
    const logs = await this.logRepo.find({
      where: { userId: partnerId, scheduledTime: Between(dayStart, nextDay) },
      order: { scheduledTime: 'ASC' },
    });
    const logsBySlot = new Map<string, { status: string; photoUrl: string | null; actualTime: string | null }>();
    const photoLogs: { reminderTitle: string | null; time: string; photoUrl: string }[] = [];
    for (const l of logs) {
      const local = scheduleToLocal(l.scheduledTime, tz);
      const hhmm = `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;
      if (l.reminderId) {
        logsBySlot.set(`${l.reminderId}|${hhmm}`, {
          status: l.status,
          photoUrl: l.photoUrl,
          actualTime: l.actualTime ? l.actualTime.toISOString() : null,
        });
      }
      if (l.photoUrl) {
        const title = plan.find((p) => p.reminderId === l.reminderId)?.title ?? l.medicineNameSnapshot ?? null;
        photoLogs.push({ reminderTitle: title, time: hhmm, photoUrl: l.photoUrl });
      }
    }

    const reminders = plan.map((item) => ({
      reminderId: item.reminderId,
      title: item.title,
      category: item.category,
      categoryLabel: item.categoryLabel,
      categoryIcon: item.categoryIcon,
      countInRate: item.countInRate,
      times: item.times.map((t) => ({
        time: t.time,
        ...(logsBySlot.get(`${item.reminderId}|${t.time}`) ?? { status: t.status, photoUrl: null, actualTime: null }),
      })),
    }));

    const medicines = await this.medicineRepo.find({ where: { userId: partnerId }, order: { createdAt: 'ASC' } });

    return {
      partner: await this.publicUser(partnerId),
      date: resolved,
      summary: { planned, done, missed, rate, waterMl, waterGoalMl },
      reminders,
      photoLogs,
      medicines: medicines.map((med) => ({
        id: med.id,
        name: med.name,
        dosage: med.dosage,
        stock: med.stock,
        threshold: med.threshold,
        instructions: med.instructions,
      })),
    };
  }

  // ============ 聊天 ============

  /** 消息列表（拉取即把对方消息置已读）；after=增量游标（ISO 时间） */
  async getMessages(userId: string, bindingId: string, after?: string, limit = 100) {
    const binding = await this.getBindingForMember(userId, bindingId, true);
    const peerId = binding.userAId === userId ? binding.userBId : binding.userAId;
    const where: Record<string, unknown> = { bindingId };
    if (after) {
      const afterDate = new Date(after);
      if (Number.isNaN(afterDate.getTime())) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'after 须为 ISO 时间' });
      }
      // createdAt 由 CURRENT_TIMESTAMP 生成（秒级精度）：比较值须为秒级字符串并含边界，
      // Date 参数会被驱动补 '.000' 后缀，导致与游标同秒的新消息被漏掉；客户端按消息 id 去重
      where.createdAt = MoreThanOrEqual(afterDate.toISOString().slice(0, 19).replace('T', ' '));
    }
    const items = await this.messageRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    });
    // 对方消息置已读（幂等；仅 active 绑定）
    await this.messageRepo.update(
      { bindingId, senderId: peerId, readAt: IsNull() as never },
      { readAt: new Date() },
    );
    items.reverse(); // 返回正序
    return {
      partner: await this.publicUser(peerId),
      items: items.map((msg) => ({
        id: msg.id,
        senderId: msg.senderId,
        content: msg.content,
        photoUrl: msg.photoUrl,
        createdAt: msg.createdAt.toISOString(),
        mine: msg.senderId === userId,
      })),
    };
  }

  /** 发送消息（文本 ≤500 + 可选图片；敏感词过滤；解绑后不可发送） */
  async sendMessage(userId: string, bindingId: string, content: string | null, photoUrl: string | null) {
    const binding = await this.getBindingForMember(userId, bindingId, true);
    const peerId = binding.userAId === userId ? binding.userBId : binding.userAId;
    const text = (content ?? '').trim();
    if (!text && !photoUrl) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '消息不能为空' });
    }
    if (photoUrl && !/^\/uploads\//.test(photoUrl)) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '图片地址无效' });
    }
    const filtered = text ? await this.filterContent(text) : null;
    const msg = await this.messageRepo.save(
      this.messageRepo.create({
        id: randomUUID(),
        bindingId,
        senderId: userId,
        content: filtered,
        photoUrl,
        readAt: null,
      }),
    );
    // 站内提醒（去重：已有同会话未读通知则不重复打扰）
    const linkUrl = `/family/chat/${bindingId}`;
    const existing = await this.notifRepo.findOne({
      where: { userId: peerId, linkUrl, isRead: false },
    });
    if (!existing) {
      await this.notify(peerId, '亲友消息', filtered ? filtered.slice(0, 50) : '[图片]', linkUrl);
    }
    return {
      id: msg.id,
      senderId: msg.senderId,
      content: msg.content,
      photoUrl: msg.photoUrl,
      createdAt: msg.createdAt.toISOString(),
      mine: true,
    };
  }

  /** 全部亲友会话未读数（角标） */
  async unreadCount(userId: string) {
    const bindings = await this.bindingRepo.find({
      where: [
        { userAId: userId, status: FamilyBindingStatus.ACTIVE },
        { userBId: userId, status: FamilyBindingStatus.ACTIVE },
      ],
    });
    if (bindings.length === 0) return { count: 0 };
    const count = await this.messageRepo.count({
      where: {
        bindingId: In(bindings.map((b) => b.id)),
        senderId: Not(userId),
        readAt: IsNull() as never,
      },
    });
    return { count };
  }

  // ============ 内部 ============

  private async getBindingForMember(userId: string, bindingId: string, activeOnly = false) {
    const binding = await this.bindingRepo.findOne({ where: { id: bindingId } });
    if (!binding) throw new NotFoundException({ code: 'NOT_FOUND', message: '绑定不存在或已解除' });
    if (binding.userAId !== userId && binding.userBId !== userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: '无权访问该绑定' });
    }
    if (activeOnly && binding.status !== FamilyBindingStatus.ACTIVE) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: '绑定尚未生效' });
    }
    return binding;
  }

  private async publicUser(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: { id: true, username: true, avatarUrl: true },
    });
    return { id: userId, username: user?.username ?? '已注销用户', avatarUrl: user?.avatarUrl ?? null };
  }

  private async toBindingDto(b: FamilyBinding, userId: string) {
    const peerId = b.userAId === userId ? b.userBId : b.userAId;
    const unread = await this.messageRepo.count({
      where: { bindingId: b.id, senderId: peerId, readAt: IsNull() as never },
    });
    return {
      id: b.id,
      status: b.status,
      /** pending 时 userA 是审批方：iAmApprover=true 表示「待我同意」 */
      iAmApprover: b.userAId === userId && b.status === FamilyBindingStatus.PENDING,
      peer: await this.publicUser(peerId),
      unread,
      createdAt: b.createdAt.toISOString(),
    };
  }

  private async notify(userId: string, title: string, content: string, linkUrl: string) {
    await this.notifRepo.save(
      this.notifRepo.create({
        id: randomUUID(),
        userId,
        type: NotificationType.SYSTEM,
        title,
        content,
        linkUrl,
      }),
    );
  }

  private async filterContent(text: string): Promise<string> {
    if (!this.sensitiveWordsCache) {
      const words = await this.sensitiveWordRepo.find();
      this.sensitiveWordsCache = words.map((w) => w.word);
    }
    return filterSensitiveWords(text, this.sensitiveWordsCache);
  }
}
