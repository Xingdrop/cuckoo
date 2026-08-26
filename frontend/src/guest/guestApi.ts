import { useGuestStore, type GuestReminder } from './guestStore';
import type { Reminder, CalendarItem, RepeatRule } from '../types';

/**
 * 游客 API 适配层（#1 游客复用原界面）：
 * 游客模式下，remindersApi/statsApi 的调用被重定向到这里——用本地数据返回
 * 与云端完全相同的结构（Reminder / CalendarItem / DashboardStats / WaterInfo），
 * 页面无需任何改动即可在游客模式使用今日 / 提醒 / 统计。
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

function toReminder(r: GuestReminder): Reminder {
  return {
    id: r.id,
    userId: 'guest',
    category: (r.category as Reminder['category']) ?? 'custom',
    categoryLabel: null,
    categoryIcon: null,
    title: r.title,
    repeatRule: { type: 'daily' } as RepeatRule,
    startDate: `${r.startDate}T00:00:00.000Z`,
    times: r.times.length ? r.times : null,
    endDate: null,
    nextTriggerAt: null,
    planId: null,
    planName: null,
    modifiedFromPlan: false,
    medicineId: null,
    content: { text: '' },
    method: { type: 'fullscreen' } as Reminder['method'],
    delaySettings: { enabled: false, maxDelayCount: 0 } as Reminder['delaySettings'],
    challenge: { enabled: false, allowGallery: false } as Reminder['challenge'],
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.createdAt,
  };
}

function logStatus(reminderId: string, date: string): string | null {
  const logs = useGuestStore.getState().logs.filter(
    (l) => l.reminderId === reminderId && l.scheduledTime.slice(0, 10) === date,
  );
  if (logs.some((l) => l.status === 'completed')) return 'completed';
  if (logs.some((l) => l.status === 'skipped')) return 'skipped';
  return null;
}

function dailyOnDate(reminder: GuestReminder, date: string): boolean {
  // 游客提醒均为每日；startDate 之后的日期均显示
  return reminder.isActive && date >= reminder.startDate;
}

export const guestApi = {
  list(): Reminder[] {
    return useGuestStore.getState().reminders.map(toReminder);
  },

  calendar(date: string): CalendarItem[] {
    const store = useGuestStore.getState();
    return store.reminders
      .filter((r) => dailyOnDate(r, date))
      .map((r) => {
        const status = logStatus(r.id, date);
        const times = r.times.length ? r.times : []; // 不定时：无时间点
        const untimed = r.times.length === 0;
        return {
          reminderId: r.id,
          nextTriggerAt: null,
          title: r.title,
          category: r.category,
          categoryLabel: null,
          categoryIcon: CATEGORY_DEFAULT[r.category] ?? null,
          content: { text: '' },
          times: times.length
            ? times.map((t) => ({ time: t, status }))
            : [{ time: '00:00', status }], // 不定时占位时间
          todayTotal: Math.max(1, times.length),
          untimed,
        } as CalendarItem;
      });
  },

  create(body: { title: string; category: string; times?: string[]; repeatRule?: { type: string }; startDate: string; content?: unknown }): Reminder {
    const store = useGuestStore.getState();
    store.saveReminder({
      title: body.title,
      category: body.category,
      times: body.times?.length ? body.times : [],
      startDate: (body.startDate ?? new Date().toISOString()).slice(0, 10),
      isActive: true,
    });
    return this.list()[0];
  },

  update(id: string, body: { title?: string; times?: string[] }): Reminder {
    const s = useGuestStore.getState();
    const target = s.reminders.find((r) => r.id === id);
    if (target) {
      s.removeReminder(id);
      s.saveReminder({
        title: body.title ?? target.title,
        category: target.category,
        times: body.times?.length ? body.times : target.times,
        startDate: target.startDate,
        isActive: target.isActive,
      });
    }
    return this.list().find((r) => r.id === id) ?? ({} as Reminder);
  },

  remove(id: string) {
    useGuestStore.getState().removeReminder(id);
    return { success: true };
  },

  setActive(id: string, active: boolean) {
    const s = useGuestStore.getState();
    const target = s.reminders.find((r) => r.id === id);
    if (target) {
      s.removeReminder(id);
      s.saveReminder({ ...target, isActive: active });
    }
    return this.list().find((r) => r.id === id) ?? ({} as Reminder);
  },

  ack(id: string, status: 'completed' | 'skipped' | string, _scheduledTime?: string) {
    useGuestStore.getState().ack(id, status === 'skipped' ? 'skipped' : 'completed');
    return { ok: true, log: { id: `l-${Date.now()}` } };
  },

  waterInfo(date?: string) {
    const key = date ?? todayKey();
    const waterMl = useGuestStore
      .getState()
      .logs.filter((l) => l.amount > 0 && l.scheduledTime.slice(0, 10) === key)
      .reduce((sum, l) => sum + l.amount, 0);
    const waterGoalMl = 2000;
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
    const reminders = this.calendar(date);
    let planned = 0;
    let done = 0;
    let missed = 0;
    for (const item of reminders) {
      for (const t of item.times) {
        if (t.status !== 'skipped') planned += 1;
        if (t.status === 'completed') done += 1;
        if (t.status === 'missed') missed += 1;
      }
    }
    const water = this.waterInfo(date);
    return {
      date,
      planned,
      done,
      missed,
      rate: planned > 0 ? Math.round((done / planned) * 100) : 0,
      streakDays: 0,
      categoryStats: {},
      water,
    } as never;
  },

  trend() {
    return [] as never;
  },
  heatmap() {
    return [] as never;
  },
};
