import { useGuestStore, type GuestReminder, type GuestMedicine, type GuestPlan, type GuestFeedPost, type GuestTemplate } from './guestStore';
import { shiftKey } from '../utils/calendar';
import type {
  Reminder,
  CalendarItem,
  RepeatRule,
  ReminderLog,
  Medicine,
  Page,
  UserSettings,
} from '../types';
import type { Plan } from '../services/api/api.plans';
import type { Post, PlanTemplate, Group } from '../services/api/api.social';
import type { Exercise } from '../services/api/api.exercises';

/**
 * 本地数据适配层（#1/#17）：
 * 游客模式 / 已登录未联网（离线账户）下，remindersApi/statsApi/medicinesApi/plansApi/
 * exercisesApi/socialApi 被重定向到这里——用本地数据返回与云端完全相同的结构。
 */

const CATEGORY_DEFAULT: Record<string, string> = {
  medication: '💊',
  exercise: '🏃',
  water: '💧',
  rest: '😴',
  work: '💼',
  custom: '📌',
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 归一化 times（兼容字符串/数组，含非法值过滤） */
function normTimes(t: unknown): string[] {
  if (Array.isArray(t)) {
    return t
      .map((x) => String(x ?? ''))
      .filter((x) => /^\d{2}:\d{2}$/.test(x));
  }
  if (typeof t === 'string') {
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) {
        return arr.map(String).filter((x) => /^\d{2}:\d{2}$/.test(x));
      }
    } catch {
      /* 非法字符串 */
    }
  }
  return [];
}

const nowIso = () => new Date().toISOString();

/** 由计划配置构建本地提醒（#18：开关开启时重建） */
function buildLocalReminderFromConfig(
  planId: string,
  c: Record<string, unknown>,
): Omit<GuestReminder, 'id' | 'createdAt'> {
  const times = normTimes(c.times ?? (c.startTime ? [c.startTime] : []));
  return {
    title: String(c.title ?? '加入的计划'),
    category: String(c.category ?? 'custom'),
    times,
    startDate: nowIso().slice(0, 10),
    isActive: true,
    repeatRule: (c.repeatRule as GuestReminder['repeatRule']) ?? { type: times.length ? 'daily' : 'daily' },
    content: (c.content as Record<string, unknown>) ?? {},
    planId,
  };
}

/** #25：本地计算下次触发时刻（种子/离线提醒无 nextTriggerAt → 调度引擎与列表时间都依赖它） */
function localNextTrigger(r: GuestReminder, now = new Date()): string | null {
  const base = new Date().toISOString().slice(0, 10);
  const rr = r.repeatRule as GuestReminder['repeatRule'];
  for (let i = 0; i < 400; i++) {
    const d = shiftKey(base, i);
    if (!dailyOnDate(r, d)) continue;
    let times = normTimes(r.times);
    if (
      rr?.type === 'interval' &&
      times.length === 0 &&
      (rr.intervalUnit === 'hour' || rr.intervalUnit === undefined)
    ) {
      const stepMs = (Number(rr.intervalValue ?? 1) || 1) * 3_600_000;
      const [sh, sm] = (r.startHour ?? '09:00').split(':').map(Number);
      const b = new Date(`${d}T${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`);
      while (b <= new Date(`${d}T23:59:59`)) {
        times.push(
          `${String(b.getHours()).padStart(2, '0')}:${String(b.getMinutes()).padStart(2, '0')}`,
        );
        b.setTime(b.getTime() + stepMs);
      }
    }
    for (const t of times) {
      const dt = new Date(`${d}T${t}:00`);
      if (dt > now) return dt.toISOString();
    }
  }
  return null;
}

function toReminder(r: GuestReminder): Reminder {
  const planName =
    r.planName ??
    (r.planId ? useGuestStore.getState().plans.find((p) => p.id === r.planId)?.name ?? null : null);
  return {
    id: r.id,
    userId: 'local',
    category: (r.category as Reminder['category']) ?? 'custom',
    categoryLabel: r.categoryLabel ?? null,
    categoryIcon: r.categoryIcon ?? null,
    title: r.title,
    repeatRule: (r.repeatRule as RepeatRule) ?? { type: 'daily' },
    startDate: `${r.startDate}T00:00:00.000Z`,
    times: r.times.length ? r.times : null,
    endDate: r.endDate ?? null,
    nextTriggerAt: r.isActive ? localNextTrigger(r) : null,
    planId: r.planId ?? null,
    planName,
    modifiedFromPlan: false,
    medicineId: r.medicineId ?? null,
    content: (r.content as Reminder['content']) ?? { text: '' },
    method: { type: 'fullscreen' } as Reminder['method'],
    delaySettings: { enabled: false, maxDelayCount: 0 } as Reminder['delaySettings'],
    challenge: { enabled: false, allowGallery: false } as Reminder['challenge'],
    isActive: r.isActive,
    countInRate: r.countInRate !== false,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt ?? r.createdAt,
  };
}

/** #25：日志本地日期 key（scheduledTime 为 UTC ISO，直接 slice 会拿到 UTC 日期——晚间跨日错位） */
const localDayOf = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** #20：按「具体时点(HH:mm)」匹配日志状态（与云端 60s 窗口一致，间隔提醒逐点打卡） */
function slotStatuses(reminderId: string, date: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const l of useGuestStore.getState().logs) {
    if (l.reminderId !== reminderId || localDayOf(l.scheduledTime) !== date) continue;
    const d = new Date(l.scheduledTime);
    const key = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (l.status === 'completed' || l.status === 'challenge_completed') map.set(key, 'completed');
    else if (l.status === 'skipped' && map.get(key) === undefined) map.set(key, 'skipped');
  }
  return map;
}

/** 该提醒是否计入完成率 */
const countsInRate = (r: GuestReminder) => r.countInRate !== false;

function dailyOnDate(reminder: GuestReminder, date: string): boolean {
  // 本地提醒均视为每日；startDate 之后的日期均显示（含种子账户快照）
  return reminder.isActive && date >= reminder.startDate;
}

function toMedicine(m: GuestMedicine): Medicine {
  return {
    id: m.id,
    userId: 'local',
    name: m.name,
    dosage: m.dosage ?? null,
    administration: m.administration ?? null,
    stock: m.stock,
    threshold: m.threshold,
    expiryDate: m.expiryDate ?? null,
    instructions: m.instructions ?? null,
    photoUrl: m.photoUrls?.length ? m.photoUrls[0] : (m.photoUrl ?? null),
    photoUrls: m.photoUrls?.length ? m.photoUrls : m.photoUrl ? [m.photoUrl] : null,
    deductionPerUse: m.deductionPerUse ?? 1,
    notifyOnLowStock: m.notifyOnLowStock !== false,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt ?? m.createdAt,
  };
}

function toPlan(p: GuestPlan): Plan {
  const count = useGuestStore
    .getState()
    .reminders.filter((r) => r.planId === p.id).length;
  return {
    id: p.id,
    userId: 'local',
    name: p.name,
    description: p.description ?? '',
    sourceType: p.sourceType ?? 'self',
    sourceTitle: p.sourceTitle ?? null,
    sourceId: p.sourceId ?? null,
    isActive: p.isActive,
    createdAt: p.createdAt,
    reminderCount: count,
    configCount: (p.config ?? []).length,
  };
}

/** #22：官方计划配置 → 本地计划 config（与云端 joinTemplate 归一化一致） */
function normalizeTemplateConfig(list: unknown[]): Array<Record<string, unknown>> {
  return (Array.isArray(list) ? list : []).map((raw) => {
    const r = (raw ?? {}) as {
      category?: string;
      title?: string;
      repeatRule?: Record<string, unknown>;
      times?: string[];
      startTime?: string;
      content?: Record<string, unknown>;
    };
    return {
      category: r.category ?? 'custom',
      title: r.title ?? '官方计划',
      repeatRule: r.repeatRule ?? { type: 'daily' },
      times: Array.isArray(r.times) ? r.times : r.startTime ? [r.startTime] : null,
      content: r.content ?? {},
    };
  });
}

/** 本地加入官方计划（游客/离线账户可用；保存到我的计划，不建提醒） */
function joinTemplateLocal(t: GuestTemplate): { joined: boolean; duplicate: boolean } {
  const store = useGuestStore.getState();
  const exists = store.plans.find((p) => p.sourceType === 'official' && p.sourceId === t.id);
  if (exists) return { joined: true, duplicate: true };
  store.savePlan({ name: t.title, description: t.description });
  const created = useGuestStore.getState().plans[0];
  if (created) {
    store.patchPlan(created.id, {
      sourceType: 'official',
      sourceId: t.id,
      sourceTitle: `官方计划：${t.title}`,
      isActive: false,
      config: normalizeTemplateConfig(t.reminderConfig),
    });
  }
  return { joined: true, duplicate: false };
}

/** 本地退出官方计划（从我的计划移除 + 清除相关提醒） */
function leaveTemplateLocal(templateId: string): { left: boolean } {
  const store = useGuestStore.getState();
  const plan = store.plans.find((p) => p.sourceType === 'official' && p.sourceId === templateId);
  if (!plan) return { left: false };
  store.removePlan(plan.id);
  return { left: true };
}

function toFeedPost(f: GuestFeedPost): Post {
  const store = useGuestStore.getState();
  const guestMode = store.active;
  const planExists = store.plans.some(
    (p) => (p.sourceType === 'share' || p.sourceType === 'official') && p.sourceId === f.id,
  );
  return {
    id: f.id,
    userId: f.userId,
    type: f.type,
    content: f.content,
    mediaUrls: f.mediaUrls ?? [],
    planSnapshot: f.planSnapshot ?? null,
    likesCount: f.likesCount ?? 0,
    commentsCount: f.commentsCount ?? 0,
    joinedCount: f.joinedCount ?? 0,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    author: f.author,
    // #22：游客不展示账户私有态（关注/点赞/收藏）；已加入按本地我的计划计算
    myLiked: guestMode ? false : !!f.myLiked,
    myFavorited: guestMode ? false : !!f.myFavorited,
    myJoined: planExists || (!guestMode && !!f.myJoined),
  };
}

/** 离线不可变操作统一错误（界面应前置禁用；这里兜底） */
const offlineMutation = () => {
  throw new Error('当前未联网：该操作需联网后使用');
};

export const guestApi = {
  // ==================== 提醒 ====================
  list(): Reminder[] {
    return useGuestStore.getState().reminders.map(toReminder);
  },

  calendar(date: string): CalendarItem[] {
    const store = useGuestStore.getState();
    return store.reminders
      .filter((r) => dailyOnDate(r, date))
      .map((r) => {
        const slotMap = slotStatuses(r.id, date); // #20：按具体时点匹配
        // #19：间隔提醒（按小时）当日时点与服务端一致：从 startHour 起每 N 小时
        let times = normTimes(r.times);
        const rr = r.repeatRule as GuestReminder['repeatRule'];
        if (rr?.type === 'interval' && times.length === 0 && (rr.intervalUnit === 'hour' || rr.intervalUnit === undefined)) {
          const stepMs = (Number(rr.intervalValue ?? 1) || 1) * 3_600_000;
          const [sh, sm] = (r.startHour ?? '09:00').split(':').map(Number);
          const base = new Date(`${date}T${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`);
          while (base < new Date(`${date}T23:59:59`)) {
            times.push(`${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`);
            base.setTime(base.getTime() + stepMs);
          }
          if (!times.length) times = [r.startHour ?? '09:00'];
        }
        const untimed = times.length === 0;
        return {
          reminderId: r.id,
          nextTriggerAt: r.isActive ? localNextTrigger(r) : null,
          title: r.title,
          category: r.category as CalendarItem['category'],
          categoryLabel: r.categoryLabel ?? null,
          categoryIcon: r.categoryIcon ?? CATEGORY_DEFAULT[r.category] ?? null,
          content: (r.content as Reminder['content']) ?? { text: '' },
          times: times.length
            ? times.map((t) => ({ time: t, status: slotMap.get(t) ?? null }))
            : [{ time: '00:00', status: null }], // 不定时占位时间
          todayTotal: Math.max(1, times.length),
          untimed,
          repeatRule: r.repeatRule as RepeatRule,
          countInRate: countsInRate(r),
        } as CalendarItem;
      });
  },

  create(body: { title: string; category: string; times?: string[]; repeatRule?: { type: string }; startDate: string; content?: unknown; countInRate?: boolean }): Reminder {
    const store = useGuestStore.getState();
    const times = normTimes(body.times);
    store.saveReminder({
      title: body.title,
      category: body.category,
      times,
      startDate: (body.startDate ?? new Date().toISOString()).slice(0, 10),
      isActive: true,
      repeatRule: (body.repeatRule as GuestReminder['repeatRule']) ?? { type: times.length ? 'daily' : 'daily' },
      content: (body.content as Record<string, unknown>) ?? {},
      planId: (body as { planId?: string | null }).planId ?? null,
      countInRate: body.countInRate !== false,
    });
    return this.list()[0];
  },

  update(id: string, body: { title?: string; times?: string[]; content?: unknown; isActive?: boolean; category?: string; countInRate?: boolean }): Reminder {
    const patch: Partial<GuestReminder> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.times !== undefined) patch.times = normTimes(body.times);
    if (body.content !== undefined) patch.content = body.content as Record<string, unknown>;
    if (body.isActive !== undefined) patch.isActive = body.isActive;
    if (body.category !== undefined) patch.category = body.category;
    if (body.countInRate !== undefined) patch.countInRate = body.countInRate;
    useGuestStore.getState().updateReminder(id, patch);
    const found = useGuestStore.getState().reminders.find((r) => r.id === id);
    return found ? toReminder(found) : ({} as Reminder);
  },

  remove(id: string) {
    const store = useGuestStore.getState();
    const target = store.reminders.find((r) => r.id === id);
    store.removeReminder(id);
    // #18：删除计划内（部分/全部）提醒 → 计划开关自动关闭（其余提醒保留）
    if (target?.planId) {
      store.patchPlanFlag(target.planId, false);
    }
    return { success: true };
  },

  setActive(id: string, active: boolean) {
    useGuestStore.getState().updateReminder(id, { isActive: active });
    const found = useGuestStore.getState().reminders.find((r) => r.id === id);
    return found ? toReminder(found) : ({} as Reminder);
  },

  ack(id: string, status: 'completed' | 'skipped' | 'photo' | string, scheduledTime?: string, photoUrl?: string) {
    useGuestStore.getState().ack(id, status === 'skipped' ? 'skipped' : (status as 'completed' | 'photo'), scheduledTime, photoUrl);
    return { ok: true, log: { id: `l-${Date.now()}` } };
  },

  /** #26：替换照片（保留原记录） */
  updateLogPhoto(logId: string, photoUrl: string) {
    useGuestStore.getState().updateLogPhoto(logId, photoUrl);
    return { ok: true };
  },

  /** #26：提醒日志（照片记录页用） */
  logs(id: string, page = 1, pageSize = 20) {
    const all = useGuestStore
      .getState()
      .logs.filter((l) => l.reminderId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      items: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
      page,
      pageSize,
    };
  },

  // ==================== 统计（本地推导） ====================
  waterInfo(date?: string) {
    const key = date ?? todayKey();
    const settings = useGuestStore.getState().settings;
    const waterMl = useGuestStore
      .getState()
      .logs.filter((l) => l.amount > 0 && localDayOf(l.scheduledTime) === key)
      .reduce((sum, l) => sum + l.amount, 0);
    const waterGoalMl = settings.waterGoalMl || 2000;
    return {
      date: key,
      waterMl,
      waterGoalMl,
      rate: Math.min(100, Math.round((waterMl / waterGoalMl) * 100)),
      reached: waterMl >= waterGoalMl,
    };
  },

  water(amountMl: number) {
    useGuestStore.getState().recordWater(amountMl);
    return this.waterInfo();
  },

  dashboard() {
    const date = todayKey();
    const reminders = this.calendar(date).filter((item) => item.countInRate !== false); // #20
    let planned = 0;
    let done = 0;
    let missed = 0;
    for (const item of reminders) {
      for (const t of item.times) {
        if (t.status !== 'skipped') planned += 1;
        if (t.status === 'completed' || t.status === 'challenge_completed') done += 1;
        if (t.status === 'missed') missed += 1;
      }
    }
    const water = this.waterInfo(date);
    // #26：喝水（当日达标）可选统计项（与云端口径一致）
    if (useGuestStore.getState().settings.waterCountInRate === true && water.reached) {
      done += 1;
      if (planned === 0) planned = 1;
    }
    return {
      date,
      planned,
      done,
      missed,
      rate: planned > 0 ? Math.round((done / planned) * 100) : done > 0 ? 100 : 0,
      streakDays: 0,
      categoryStats: {
        // #26：喝水单独进入分类统计（无论是否计入完成率）
        water: {
          planned: water.waterGoalMl > 0 ? 1 : 0,
          done: water.reached ? 1 : 0,
          rate: water.waterGoalMl > 0 ? Math.min(100, Math.round((water.waterMl / water.waterGoalMl) * 100)) : 0,
          waterMl: water.waterMl,
          waterGoalMl: water.waterGoalMl,
        } as never,
        ...this.categoryStats(date),
      },
      water,
    } as never;
  },

  /** #26：分类统计（今日各分类完成/计划） */
  categoryStats(date: string) {
    const out: Record<string, { planned: number; done: number; rate: number }> = {};
    for (const item of this.calendar(date)) {
      const key = item.categoryLabel ?? item.category;
      if (!out[key]) out[key] = { planned: 0, done: 0, rate: 0 };
      for (const t of item.times) {
        if (t.status !== 'skipped') out[key].planned += 1;
        if (t.status === 'completed' || t.status === 'challenge_completed') out[key].done += 1;
      }
      out[key].rate = out[key].planned > 0 ? Math.round((out[key].done / out[key].planned) * 100) : 0;
    }
    return out;
  },

  trend(days = 7) {
    const logs = useGuestStore.getState().logs;
    const flag = useGuestStore
      .getState()
      .reminders.reduce<Record<string, boolean>>((m, r) => ({ ...m, [r.id]: countsInRate(r) }), {});
    const out: { date: string; planned: number; done: number; rate: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const dayLogs = logs.filter((l) => localDayOf(l.scheduledTime) === d && (flag[l.reminderId ?? ''] ?? true));
      const done = dayLogs.filter((l) => l.status === 'completed' || l.status === 'challenge_completed').length;
      out.push({
        date: d,
        planned: dayLogs.length,
        done,
        rate: dayLogs.length ? Math.round((done / dayLogs.length) * 100) : 0,
      });
    }
    return out;
  },

  heatmap(month: string) {
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const out: { date: string; planned: number; done: number; rate: number }[] = [];
    const logs = useGuestStore.getState().logs;
    const flag = useGuestStore
      .getState()
      .reminders.reduce<Record<string, boolean>>((mm, r) => ({ ...mm, [r.id]: countsInRate(r) }), {});
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${month}-${String(d).padStart(2, '0')}`;
      const dayLogs = logs.filter((l) => localDayOf(l.scheduledTime) === key && (flag[l.reminderId ?? ''] ?? true));
      const done = dayLogs.filter((l) => l.status === 'completed' || l.status === 'challenge_completed').length;
      out.push({
        date: key,
        planned: dayLogs.length,
        done,
        rate: dayLogs.length ? Math.round((done / dayLogs.length) * 100) : 0,
      });
    }
    return out;
  },

  // ==================== 药品 ====================
  medicines(): Medicine[] {
    return useGuestStore.getState().medicines.map(toMedicine);
  },
  createMedicine(body: Partial<Medicine>): Medicine {
    const store = useGuestStore.getState();
    store.saveMedicine({
      name: body.name ?? '未命名药品',
      dosage: body.dosage ?? null,
      administration: body.administration ?? null,
      stock: Number(body.stock ?? 0),
      threshold: Number(body.threshold ?? 0),
      expiryDate: body.expiryDate ?? null,
      instructions: body.instructions ?? null,
      photoUrl: body.photoUrls?.length ? body.photoUrls[0] : (body.photoUrl ?? null),
      photoUrls: body.photoUrls?.length ? body.photoUrls : body.photoUrl ? [body.photoUrl] : null,
      deductionPerUse: Number(body.deductionPerUse ?? 1),
      notifyOnLowStock: body.notifyOnLowStock !== false,
    });
    return this.medicines()[0];
  },
  updateMedicine(id: string, patch: Partial<Medicine>): Medicine {
    useGuestStore.getState().updateMedicine(id, patch as never);
    const found = useGuestStore.getState().medicines.find((m) => m.id === id);
    return found ? toMedicine(found) : ({} as Medicine);
  },
  removeMedicine(id: string) {
    useGuestStore.getState().removeMedicine(id);
    return { success: true };
  },
  adjustStock(id: string, delta: number): Medicine {
    const store = useGuestStore.getState();
    const m = store.medicines.find((x) => x.id === id);
    if (m) store.updateMedicine(id, { stock: Math.max(0, m.stock + delta) });
    const found = useGuestStore.getState().medicines.find((x) => x.id === id);
    return found ? toMedicine(found) : ({} as Medicine);
  },
  deduct(id: string, quantity: number) {
    const store = useGuestStore.getState();
    const m = store.medicines.find((x) => x.id === id);
    if (m) store.updateMedicine(id, { stock: Math.max(0, m.stock - quantity) });
    return { success: true };
  },
  medicineLogs(): Page<ReminderLog> {
    // 本地不单独存药品服用日志（与提醒日志同源）
    return { items: [], total: 0, page: 1, pageSize: 20 } as Page<ReminderLog>;
  },

  // ==================== 我的计划（#18：开关联动提醒） ====================
  plans(): Plan[] {
    return useGuestStore.getState().plans.map(toPlan);
  },
  createPlan(body: { name: string; description?: string }): Plan {
    useGuestStore.getState().savePlan({ name: body.name, description: body.description });
    return this.plans()[0];
  },
  patchPlan(id: string, patch: { name?: string; description?: string; isActive?: boolean }): Plan {
    const s = useGuestStore.getState();
    const plan = s.plans.find((p) => p.id === id);
    if (plan && patch.isActive !== undefined && patch.isActive !== plan.isActive) {
      if (patch.isActive) {
        // 开启：按配置重建缺失的提醒（已有的保留）
        const configs = (plan.config ?? []) as Array<Record<string, unknown>>;
        let changed = false;
        const nextConfig = configs.map((c) => {
          const rid = c.reminderId as string | undefined;
          const existing = rid ? useGuestStore.getState().reminders.find((r) => r.id === rid) : null;
          if (existing) return c;
          const base = buildLocalReminderFromConfig(id, c);
          const newId = `g-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
          useGuestStore.getState().insertReminder({ ...base, id: newId, createdAt: nowIso(), updatedAt: nowIso() });
          changed = true;
          return { ...c, reminderId: newId };
        });
        if (changed) useGuestStore.getState().patchPlan(id, { config: nextConfig });
      } else {
        // 关闭：清除全部相关提醒（配置保留——再次开启可重建）
        const s2 = useGuestStore.getState();
        for (const r of [...s2.reminders.filter((x) => x.planId === id)]) s2.removeReminder(r.id);
      }
    }
    useGuestStore.getState().patchPlan(id, patch as never);
    const found = useGuestStore.getState().plans.find((p) => p.id === id);
    return found ? toPlan(found) : ({} as Plan);
  },
  removePlan(id: string) {
    const s = useGuestStore.getState();
    for (const r of [...s.reminders.filter((x) => x.planId === id)]) s.removeReminder(r.id);
    s.removePlan(id);
    return { success: true };
  },

  /** #22：本地加入/退出官方计划（游客/离线账户：保存到我的计划，开关启停建提醒） */
  joinOfficialTemplate(id: string): { joined: boolean; duplicate: boolean } {
    const t = this.getTemplate(id);
    if (!t) throw new Error('官方计划不在本地缓存中（请联网刷新后重试）');
    return joinTemplateLocal(t);
  },
  leaveOfficialTemplate(id: string): { left: boolean } {
    return leaveTemplateLocal(id);
  },

  // ==================== 设置（本地） ====================
  settings(): UserSettings {
    const s = useGuestStore.getState().settings;
    return {
      userId: 'local',
      notificationEnabled: s.notificationEnabled !== false,
      soundEnabled: s.soundEnabled !== false,
      vibrationEnabled: s.vibrationEnabled !== false,
      theme: s.theme ?? 'default',
      missedThresholdMinutes: s.missedThresholdMinutes ?? 30,
      showSkipButton: s.showSkipButton === true,
      maxDelayCount: s.maxDelayCount ?? 3,
      waterGoalMl: s.waterGoalMl,
      waterInRate: s.waterInRate === true,
      waterCountInRate: s.waterCountInRate === true,
    };
  },
  saveSettings(patch: Partial<UserSettings>): UserSettings {
    const merged: Partial<UserSettings> = {};
    for (const k of [
      'notificationEnabled', 'soundEnabled', 'vibrationEnabled', 'theme',
      'missedThresholdMinutes', 'showSkipButton', 'maxDelayCount',
      'waterGoalMl', 'waterInRate', 'waterCountInRate',
    ] as const) {
      if (patch[k] !== undefined) (merged as Record<string, unknown>)[k] = patch[k];
    }
    useGuestStore.getState().saveSettings(merged as never);
    return this.settings();
  },

  // ==================== 微运动 ====================
  exercises(): Exercise[] {
    return useGuestStore.getState().exercises;
  },

  // ==================== 社交（缓存只读） ====================
  feedPosts(): Post[] {
    return useGuestStore.getState().feed.map(toFeedPost);
  },
  followingUsers(): { id: string; username: string; avatarUrl: string | null }[] {
    const s = useGuestStore.getState();
    const authorById = new Map(s.feed.map((f) => [f.author.id, f.author]));
    return s.followings
      .map((id) => authorById.get(id) ?? { id, username: '已关注用户', avatarUrl: null })
      .filter((u, i, arr) => arr.findIndex((x) => x.id === u.id) === i);
  },
  getFeedPost(id: string): Post | undefined {
    const f = useGuestStore.getState().feed.find((x) => x.id === id);
    return f ? toFeedPost(f) : undefined;
  },
  templates(): PlanTemplate[] {
    const plans = useGuestStore.getState().plans;
    return useGuestStore
      .getState()
      .templates.map((t) => ({
        ...t,
        // #20：官方计划 joined = 已保存到我的计划
        joined: plans.some((p) => p.sourceType === 'official' && p.sourceId === t.id),
      }));
  },
  getTemplate(id: string): PlanTemplate | undefined {
    const t = useGuestStore.getState().templates.find((x) => x.id === id);
    if (!t) return undefined;
    const plans = useGuestStore.getState().plans;
    return { ...t, joined: plans.some((p) => p.sourceType === 'official' && p.sourceId === t.id) };
  },
  groups(): Group[] {
    return useGuestStore.getState().groups.map((g) => ({ ...g, ownerId: g.ownerId ?? '' }));
  },
  notifications(): Page<{ id: string; userId: string; type: string; title: string; content: string; linkUrl: string | null; isRead: boolean; createdAt: string }> & { unread: number } {
    const items = useGuestStore.getState().notifications.map((n) => ({ ...n, userId: 'local' }));
    return { items, total: items.length, page: 1, pageSize: 50, unread: items.filter((n) => !n.isRead).length };
  },
  togglePostLiked(id: string) {
    const store = useGuestStore.getState();
    const f = store.feed.find((x) => x.id === id);
    if (f) {
      const next = !f.myLiked;
      store.seedSocial({
        feed: store.feed.map((x) =>
          x.id === id
            ? { ...x, myLiked: next, likesCount: x.likesCount + (next ? 1 : -1) }
            : x,
        ),
      } as never);
    }
  },

  // 离线不可变操作
  offlineMutation,
};
