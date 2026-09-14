/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy91c2Vycy91c2Vycy5zZXJ2aWNlLnRzfDIwMjYtMDl8ZGU4MDUxNDM5Yw== */ */
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { DataSource, In, Repository } from 'typeorm';
import { computeNextTrigger } from '../../common/reminder-schedule';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { Achievement } from '../achievements/achievement.entity';
import { EmergencyContact } from '../contacts/emergency-contact.entity';
import { Device } from '../notifications/device.entity';
import { Notification } from '../notifications/notification.entity';
import { Medicine } from '../medicines/medicine.entity';
import { Post } from '../social/post.entity';
import { SensitiveWord } from '../social/sensitive-word.entity';
import { Interaction } from '../social/interaction.entity';
import { PlanJoinRecord } from '../social/plan-join-record.entity';
import { Plan } from '../plans/plan.entity';
import { Reminder } from '../reminders/reminder.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { UserSetting } from './user-setting.entity';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly settingRepo: Repository<UserSetting>,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async getMe(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '用户不存在' });
    }
    return this.authService.toPublic(user);
  }

  async updateMe(
    userId: string,
    patch: Partial<Pick<User, 'avatarUrl' | 'healthGoals' | 'timezone'>>,
  ) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '用户不存在' });
    }
    if (patch.avatarUrl !== undefined) user.avatarUrl = patch.avatarUrl;
    if (patch.healthGoals !== undefined) user.healthGoals = patch.healthGoals;
    if (patch.timezone !== undefined) user.timezone = patch.timezone;
    await this.userRepo.save(user);
    return this.authService.toPublic(user);
  }

  async getSettings(userId: string): Promise<UserSetting> {
    let setting = await this.settingRepo.findOne({ where: { userId } });
    if (!setting) {
      setting = await this.settingRepo.save(this.settingRepo.create({ userId }));
    }
    return setting;
  }

  async updateSettings(
    userId: string,
    patch: Partial<UserSetting>,
  ): Promise<UserSetting> {
    // 注意：不能用 save(entity)——TypeORM 1.x 对带 transformer 的列会写入数据库旧值
    await this.settingRepo.update({ userId }, patch);
    return this.getSettings(userId);
  }

  // ============ M5：数据导出 / 注销（FR-105，AC-105/106，IT-06） ============

  /**
   * 游客数据导入合并（#2/#3：游客账户升级）——按"同类数据 created_at 较新优先"合并。
   * 位置：登录后调用；bundle 结构见游客端导出（reminders/logs/medicines/plans/posts）。
   */
  async importData(
    userId: string,
    bundle: {
      reminders?: unknown[];
      logs?: unknown[];
      medicines?: unknown[];
      plans?: unknown[];
      posts?: unknown[];
      settings?: unknown;
      /** 2026-09-06：离线删除墓碑——本地镜像期间删除的 id，导入时同步删除（防 upsert 复活） */
      deleted?: { reminders?: unknown[]; medicines?: unknown[]; plans?: unknown[] };
    },
  ) {
    type Item = Record<string, unknown>;
    const asItems = (arr?: unknown[]): Item[] =>
      (Array.isArray(arr) ? (arr as Item[]) : []).slice(0, 2000);
    const counts: Record<string, { imported: number; skipped: number }> = {};

    /**
     * 按 id+更新时间合并的通用实现：云端较新跳过，本地较新 upsert（updatedAt 优先，回退 createdAt）。
     * 2026-09-14 安全修复：查询与更新**必须带 userId**——此前只按裸 id 查/改，任何人构造
     * `{ id: <他人帖子id>, updatedAt: 9999 }` 即可改写他人数据（跨租户写入）。
     */
    const mergeRows = async (
      repo: any,
      items: Item[],
      makeEntity: (id: string, raw: Item) => Record<string, unknown>,
    ) => {
      let imported = 0;
      let skipped = 0;
      for (const raw of items) {
        const id = raw.id as string;
        if (!id || typeof id !== 'string') continue;
        const cloud = await repo.findOne({ where: { id, userId }, withDeleted: true });
        if (!cloud) {
          // 该 id 已属他人：跳过而非覆盖（save 会主键冲突报 500，且等于是存在性预言机）
          const takenByOther = await repo.findOne({ where: { id }, withDeleted: true });
          if (takenByOther) {
            skipped += 1;
            continue;
          }
        }
        const guestAt =
          typeof raw.updatedAt === 'string'
            ? new Date(raw.updatedAt as string).getTime()
            : typeof raw.createdAt === 'string'
              ? new Date(raw.createdAt as string).getTime()
              : 0;
        const cloudAt =
          (cloud && (cloud as { updatedAt?: Date }).updatedAt
            ? new Date((cloud as { updatedAt: Date }).updatedAt).getTime()
            : 0) ||
          (cloud?.createdAt ? new Date(cloud.createdAt).getTime() : 0);
        if (cloud && guestAt <= cloudAt) {
          skipped += 1;
          continue;
        }
        if (cloud) {
          await repo.update({ id, userId }, makeEntity(id, raw));
        } else {
          await repo.save(repo.create(makeEntity(id, raw)));
        }
        imported += 1;
      }
      return { imported, skipped };
    };

    // 提醒
    if (bundle.reminders?.length) {
      const repo = this.dataSource.getRepository(Reminder);
      counts.reminders = await mergeRows(repo as never, asItems(bundle.reminders), (id, raw) => ({
        id,
        userId,
        title: String(raw.title ?? '导入的提醒'),
        category: String(raw.category ?? 'custom'),
        categoryLabel: (raw.categoryLabel as string) ?? null,
        categoryIcon: (raw.categoryIcon as string) ?? null,
        repeatRule: (raw.repeatRule as Reminder['repeatRule']) ?? { type: 'daily' },
        startDate: raw.startDate ? new Date(raw.startDate as string) : new Date(),
        endDate: raw.endDate ? new Date(raw.endDate as string) : null,
        times: (raw.times as string[] | null) ?? null,
        content: (raw.content as Reminder['content']) ?? {},
        medicineId: (raw.medicineId as string) ?? null,
        planId: (raw.planId as string) ?? null,
        isActive: raw.isActive !== false,
        countInRate: raw.countInRate !== false,
        nextTriggerAt: computeNextTrigger(
          (raw.repeatRule as Reminder['repeatRule']) ?? { type: 'daily' },
          new Date(),
          raw.startDate ? new Date(raw.startDate as string) : new Date(),
          raw.endDate ? new Date(raw.endDate as string) : null,
          'Asia/Shanghai',
          (raw.times as string[] | null) ?? null,
        ),
      }));
    }
    // 执行日志
    if (bundle.logs?.length) {
      const repo = this.dataSource.getRepository(ReminderLog);
      counts.logs = await mergeRows(repo as never, asItems(bundle.logs), (id, raw) => ({
        id,
        userId,
        reminderId: (raw.reminderId as string) ?? null,
        scheduledTime: raw.scheduledTime ? new Date(raw.scheduledTime as string) : new Date(),
        actualTime: raw.actualTime ? new Date(raw.actualTime as string) : new Date(),
        status: String(raw.status ?? 'completed'),
        delayMinutes: Number(raw.delayMinutes ?? 0),
        photoUrl: (raw.photoUrl as string) ?? null,
        note: (raw.note as string) ?? null,
        medicineId: (raw.medicineId as string) ?? null,
        medicineNameSnapshot: (raw.medicineNameSnapshot as string) ?? null,
        category: String(raw.category ?? 'custom'),
        amount: Number(raw.amount ?? 0),
        stockDeducted: Number(raw.stockDeducted ?? 0),
      }));
    }
    // 药品
    if (bundle.medicines?.length) {
      const repo = this.dataSource.getRepository(Medicine);
      counts.medicines = await mergeRows(repo as never, asItems(bundle.medicines), (id, raw) => ({
        id,
        userId,
        name: String(raw.name ?? '导入的药品'),
        dosage: (raw.dosage as string) ?? null,
        stock: Number(raw.stock ?? 0),
        threshold: Number(raw.threshold ?? 0),
        deductionPerUse: Number(raw.deductionPerUse ?? 1),
        notifyOnLowStock: raw.notifyOnLowStock !== false,
        administration: (raw.administration as string) ?? null,
        instructions: (raw.instructions as string) ?? null,
        expiryDate: raw.expiryDate ? new Date(raw.expiryDate as string) : null,
        // #25：多张照片
        photoUrl:
          (Array.isArray(raw.photoUrls) && (raw.photoUrls as string[]).length
            ? (raw.photoUrls as string[])[0]
            : (raw.photoUrl as string)) ?? null,
        photoUrls: Array.isArray(raw.photoUrls)
          ? (raw.photoUrls as string[])
          : raw.photoUrl
            ? [raw.photoUrl as string]
            : null,
      }));
    }
    // 计划（#22：合并 config —— 加入时保存的提醒配置，可重建提醒）
    if (bundle.plans?.length) {
      const repo = this.dataSource.getRepository(Plan);
      counts.plans = await mergeRows(repo as never, asItems(bundle.plans), (id, raw) => ({
        id,
        userId,
        name: String(raw.name ?? '导入的计划'),
        description: String(raw.description ?? ''),
        sourceType: (raw.sourceType as Plan['sourceType']) ?? 'self',
        sourceTitle: (raw.sourceTitle as string) ?? null,
        sourceId: (raw.sourceId as string) ?? null,
        isActive: raw.isActive !== false,
        config: Array.isArray(raw.config) ? (raw.config as Record<string, unknown>[]) : null,
      }));
    }

    // 离线删除墓碑：仅按「id + 属主」删除，绝不跨账号（软删 Reminder/Medicine；Plan 无软删列 → 硬删）
    const tomb = bundle.deleted ?? {};
    const tombIds = (arr: unknown): string[] =>
      (Array.isArray(arr) ? arr : [])
        .filter((x): x is string => typeof x === 'string' && x.length > 0)
        .slice(0, 2000);
    const delReminders = tombIds(tomb.reminders);
    const delMedicines = tombIds(tomb.medicines);
    const delPlans = tombIds(tomb.plans);
    if (delReminders.length) {
      await this.dataSource.getRepository(Reminder).softDelete({ id: In(delReminders), userId });
    }
    if (delMedicines.length) {
      await this.dataSource.getRepository(Medicine).softDelete({ id: In(delMedicines), userId });
    }
    if (delPlans.length) {
      await this.dataSource.getRepository(Plan).delete({ id: In(delPlans), userId });
    }
    if (delReminders.length || delMedicines.length || delPlans.length) {
      counts.tombstones = {
        reminders: delReminders.length,
        medicines: delMedicines.length,
        plans: delPlans.length,
      } as never;
    }
    // 帖子（导入同样过敏感词过滤，堵住"离线绕过内容审核"）
    if (bundle.posts?.length) {
      const repo = this.dataSource.getRepository(Post);
      const { filterSensitiveWords } = await import('../../common/sensitive-words');
      const words = await this.dataSource.getRepository(SensitiveWord).find();
      const wordList = words.map((w) => w.word);
      const safePosts = asItems(bundle.posts).filter((raw) => {
        const text = String(raw.content ?? '');
        return filterSensitiveWords(text, wordList) === text;
      });
      if (safePosts.length !== asItems(bundle.posts).length) {
        counts.postsBlocked = { imported: 0, skipped: asItems(bundle.posts).length - safePosts.length };
      }
      counts.posts = await mergeRows(repo as never, safePosts, (id, raw) => ({
        id,
        userId,
        type: String(raw.type ?? 'user_plan'),
        content: String(raw.content ?? ''),
        mediaUrls: Array.isArray(raw.mediaUrls) ? (raw.mediaUrls as string[]) : [],
        planSnapshot: (raw.planSnapshot as Record<string, unknown>) ?? null,
      }));
    }
    // 用户设置（#17：离线本地设置合并回流——仅覆盖显式提供的字段）
    if (bundle.settings && typeof bundle.settings === 'object') {
      const s = bundle.settings as Item;
      const fields = [
        'notificationEnabled', 'soundEnabled', 'vibrationEnabled', 'theme',
        'missedThresholdMinutes', 'showSkipButton', 'maxDelayCount',
        'waterGoalMl', 'waterInRate',
      ].filter((k) => s[k] !== undefined) as (keyof UserSetting)[];
      if (fields.length > 0) {
        // user_settings 无 updated_at 列：本地显式提供的设置视为较新并覆盖（部分字段合并不覆盖未提供项）
        await this.dataSource.transaction(async (manager) => {
          const repo = manager.getRepository(UserSetting);
          const cloud = await repo.findOne({ where: { userId } });
          const patch: Record<string, unknown> = {};
          for (const f of fields) patch[f] = s[f];
          patch.userId = userId;
          if (cloud) {
            await repo.update({ userId }, patch as never);
          } else {
            await repo.save(repo.create(patch));
          }
        });
        counts.settings = { imported: 1, skipped: 0 };
      }
    }

    void this.audit.record('user.import', userId, { targetType: 'user', targetId: userId, detail: counts });
    return { imported: counts, totalImported: Object.values(counts).reduce((s, c) => s + c.imported, 0) };
  }

  /** 全量数据导出（JSON）：用户资料/设置/提醒/执行记录/药品/帖子/互动/通知/设备/亲友/成就 */
  async exportData(userId: string) {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    const [settings, reminders, reminderLogs, medicines, posts, interactions, notifications, devices, contacts, achievements] =
      await Promise.all([
        this.settingRepo.findOne({ where: { userId } }),
        this.reminderRepo().find({ where: { userId } }),
        this.logRepo().find({ where: { userId } }),
        this.medicineRepo().find({ where: { userId } }),
        this.postRepo().find({ where: { userId } }),
        this.interactionRepo().find({ where: { userId } }),
        this.notifRepo().find({ where: { userId } }),
        this.deviceRepo().find({ where: { userId } }),
        this.contactRepo().find({ where: { userId } }),
        this.achievementRepo().find({ where: { userId } }),
      ]);
    return {
      exportedAt: new Date().toISOString(),
      user: this.authService.toPublic(user),
      settings: settings ?? null,
      reminders,
      reminderLogs,
      medicines,
      posts,
      interactions,
      notifications,
      devices,
      emergencyContacts: contacts,
      achievements,
    };
  }

  /**
   * #1（2026-09-09 深夜）：导出改为人类可读的 HTML 报告——普通人双击/浏览器打开即看，
   * 不再丢一个 JSON 文件（原始 JSON 仍可经 GET /users/me/export 获取，供备份/迁移）。
   */
  async createExportLink(userId: string) {
    const data = await this.exportData(userId);
    const dir = join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads', 'exports');
    fs.mkdirSync(dir, { recursive: true });
    const dayMs = 24 * 3_600_000;
    for (const f of fs.readdirSync(dir)) {
      const p = join(dir, f);
      try {
        if (Date.now() - fs.statSync(p).mtimeMs > dayMs) fs.unlinkSync(p);
      } catch {
        /* 清理失败忽略 */
      }
    }
    // 文件名不可猜（原 userId 前 8 位 + 毫秒时间戳可被推导出直链）
    const name = `cuckoo-report-${randomUUID()}.html`;
    fs.writeFileSync(join(dir, name), await buildHtmlReport(data), 'utf8');
    void this.audit.record('user.export-link', userId, { targetType: 'user', targetId: userId });
    return { url: `/uploads/exports/${name}`, expiresInHours: 24 };
  }

  /**
   * 注销账号（演示口径：软删除用户 + 立即物理清理业务数据，审计留存）。
   * 软删除后：JWT 校验（jwt.strategy）与登录（findOne 默认过滤）均失效。
   */
  async deleteAccount(userId: string) {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Reminder).softDelete({ userId });
      await manager.getRepository(ReminderLog).delete({ userId });
      await manager.getRepository(Medicine).softDelete({ userId });
      await manager.getRepository(Post).softDelete({ userId });
      await manager.getRepository(Interaction).delete({ userId });
      await manager.getRepository(PlanJoinRecord).delete({ userId });
      await manager.getRepository(Notification).delete({ userId });
      await manager.getRepository(Device).delete({ userId });
      await manager.getRepository(EmergencyContact).delete({ userId });
      await manager.getRepository(Achievement).delete({ userId });
      await manager.getRepository(UserSetting).delete({ userId });
      await manager.getRepository(User).softDelete({ id: userId });
    });
    void this.audit.record('user.delete', userId, { detail: { scope: 'hard-clean' } });
    return { success: true };
  }

  // repo 快捷获取（避免构造器爆长；均不带默认过滤之外的上下文）
  private reminderRepo() { return this.dataSource.getRepository(Reminder); }
  private logRepo() { return this.dataSource.getRepository(ReminderLog); }
  private medicineRepo() { return this.dataSource.getRepository(Medicine); }
  private postRepo() { return this.dataSource.getRepository(Post); }
  private interactionRepo() { return this.dataSource.getRepository(Interaction); }
  private notifRepo() { return this.dataSource.getRepository(Notification); }
  private deviceRepo() { return this.dataSource.getRepository(Device); }
  private contactRepo() { return this.dataSource.getRepository(EmergencyContact); }
  private achievementRepo() { return this.dataSource.getRepository(Achievement); }
}

// ============ #1（2026-09-09 深夜）：HTML 导出报告（人类可读，浏览器打开即看） ============

type ExportBundle = Awaited<ReturnType<UsersService['exportData']>>;

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** SQLite 存 UTC（"YYYY-MM-DD HH:mm:ss[.SSS]"）→ 本地时间展示 */
const fmtLocal = (s: string | null | undefined) => {
  if (!s) return '';
  const d = new Date(String(s).includes('T') ? String(s) : `${String(s).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return String(s);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const LOG_STATUS: Record<string, { label: string; color: string }> = {
  completed: { label: '已完成', color: '#16803c' },
  challenge_completed: { label: '拍照打卡完成', color: '#16803c' },
  manual: { label: '手动打卡', color: '#16803c' },
  skipped: { label: '已放弃', color: '#6b7280' },
  missed: { label: '已错过', color: '#c03939' },
  delayed: { label: '已延迟', color: '#b45309' },
  photo: { label: '拍照记录', color: '#2563eb' },
  note: { label: '留言', color: '#7c3aed' },
};

const CATEGORY_EMOJI: Record<string, string> = {
  medication: '💊', exercise: '🏃', water: '💧', rest: '😴', work: '💼', custom: '📌',
};

const repeatText = (r: { type?: string; intervalValue?: number; intervalUnit?: string } | null | undefined) => {
  if (!r) return '';
  if (r.type === 'daily') return '每天';
  if (r.type === 'once') return '单次';
  if (r.type === 'interval') return `每 ${r.intervalValue ?? 1} ${r.intervalUnit === 'minute' ? '分钟' : r.intervalUnit === 'week' ? '周' : '小时'}`;
  if (r.type === 'week') return '每周指定日';
  return r.type ?? '';
};

/**
 * 照片内嵌（#34，2026-09-10 深夜）：photoUrl（/uploads/...）→ base64 data URI。
 * 浏览器只会下载报告这一个文件——照片必须内嵌才能离线查看（此前 <img src="/uploads/...">
 * 下载后全 404）。sharp 压缩（宽 ≤480 / JPEG q72）控制单文件体积；读图失败回退文字标记。
 */
async function embedPhoto(photoUrl: string | null | undefined): Promise<string> {
  if (!photoUrl) return '';
  try {
    const rel = photoUrl.replace(/^\/+uploads\//, '').replace(/^\/+/, '');
    const abs = join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads', rel);
    if (!fs.existsSync(abs)) return '';
    const buf = await sharp(abs).rotate().resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
    return `<img src="data:image/jpeg;base64,${buf.toString('base64')}" alt="照片记录" style="max-width:120px;border-radius:8px;display:block;margin:2px 0;">`;
  } catch {
    return '';
  }
}

/**
 * 自包含 HTML 报告：概览 → 提醒清单 → 近 7 天执行记录（含照片内嵌）→ 药品库存。
 * 内联样式、无外部依赖、照片 base64 内嵌——单文件离线可看，手机/桌面浏览器直接打开。
 */
async function buildHtmlReport(data: ExportBundle): Promise<string> {
  const logs7 = [...(data.reminderLogs ?? [])]
    .filter((l) => l.scheduledTime && Date.now() - new Date(String(l.scheduledTime).includes('T') ? String(l.scheduledTime) : `${String(l.scheduledTime).replace(' ', 'T')}Z`).getTime() < 7 * 86_400_000)
    .sort((a, b) => String(b.scheduledTime).localeCompare(String(a.scheduledTime)))
    .slice(0, 300);
  const reminderTitle = new Map((data.reminders ?? []).map((r) => [r.id, r.title] as const));
  const doneCount = (data.reminderLogs ?? []).filter((l) => l.status === 'completed' || l.status === 'challenge_completed').length;
  const sections: string[] = [];

  const card = (inner: string) => `<div class="card">${inner}</div>`;
  const table = (head: string[], rows: string[][]) =>
    rows.length === 0
      ? '<p class="empty">暂无数据</p>'
      : `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`;

  sections.push(
    card(
      `<h2>概览</h2><div class="stats">
        <div class="stat"><b>${data.reminders?.length ?? 0}</b><span>提醒</span></div>
        <div class="stat"><b>${data.reminderLogs?.length ?? 0}</b><span>执行记录</span></div>
        <div class="stat"><b>${doneCount}</b><span>累计完成</span></div>
        <div class="stat"><b>${data.medicines?.length ?? 0}</b><span>药品</span></div>
      </div>
      <p class="muted">账号：${esc(data.user?.username ?? '—')}　导出时间：${fmtLocal(data.exportedAt)}</p>`,
    ),
  );

  sections.push(
    card(
      `<h2>我的提醒</h2>${table(
        ['提醒', '时间', '重复', '状态'],
        (data.reminders ?? []).map((r) => [
          `${CATEGORY_EMOJI[r.category] ?? '📌'} ${esc(r.title)}`,
          esc((r.times ?? []).join('、')) || '不定时',
          esc(repeatText(r.repeatRule)),
          r.isActive ? '<span class="ok">开启</span>' : '<span class="off">已停用</span>',
        ]),
      )}</div>`,
    ),
  );

  sections.push(
    card(
      `<h2>近 7 天执行记录</h2>${table(
        ['时间', '提醒', '结果', '记录'],
        await Promise.all(
          logs7.map(async (l) => {
            const st = LOG_STATUS[l.status] ?? { label: l.status, color: '#374151' };
            const photoHtml = await embedPhoto(l.photoUrl);
            // 安全修复（2026-09-14）：note 是用户可写字段，此前未转义 → 存储型 XSS
            const extra = [esc(l.note), photoHtml || (l.photoUrl ? '📷 有照片（文件已清理）' : '')]
              .filter(Boolean)
              .join('　');
            return [
              esc(fmtLocal(String(l.scheduledTime))),
              esc(reminderTitle.get(String(l.reminderId)) ?? '—'),
              `<span style="color:${st.color};font-weight:600">${st.label}</span>`,
              extra,
            ];
          }),
        ),
      )}</div>`,
    ),
  );

  sections.push(
    card(
      `<h2>我的药品</h2>${table(
        ['药品', '剂量', '库存', '服用说明'],
        (data.medicines ?? []).map((m) => [
          `💊 ${esc((m as { name?: string }).name)}`,
          esc((m as { dosage?: string }).dosage),
          esc(String((m as { stock?: number }).stock ?? '')),
          esc((m as { instructions?: string }).instructions),
        ]),
      )}</div>`,
    ),
  );

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>布谷数据导出报告</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; background: #f6f4ef; color: #40312a;
         font: 14px/1.6 "PingFang SC","HarmonyOS Sans SC","Microsoft YaHei",sans-serif; }
  h1 { font-size: 20px; margin: 4px 0 12px; }
  h2 { font-size: 15px; margin: 0 0 10px; }
  .card { background: #fff; border-radius: 14px; padding: 14px; margin-bottom: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,.06); overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { text-align: left; color: #8a7462; font-weight: 500; padding: 6px 8px;
       border-bottom: 1px solid #f0e4d8; white-space: nowrap; }
  td { padding: 7px 8px; border-bottom: 1px solid #f7f1e8; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .stats { display: flex; gap: 10px; text-align: center; }
  .stat { flex: 1; background: #f6f4ef; border-radius: 10px; padding: 10px 4px; }
  .stat b { display: block; font-size: 20px; color: #2f7d63; }
  .stat span { font-size: 11px; color: #8a7462; }
  .muted { color: #8a7462; font-size: 12px; margin: 10px 0 0; }
  .empty { color: #8a7462; font-size: 12.5px; margin: 4px 0; }
  .ok { color: #16803c; font-weight: 600; }
  .off { color: #9ca3af; }
  footer { text-align: center; color: #b09a88; font-size: 11px; padding: 8px 0 16px; }
</style>
</head>
<body>
<h1>布谷数据导出报告</h1>
${sections.join('\n')}
<footer>本报告由布谷 App 生成，仅包含你的数据 · 原始 JSON 备份可联系开发者获取</footer>
</body>
</html>`;
}
