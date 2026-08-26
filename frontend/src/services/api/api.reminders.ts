import { http } from '../http';
import { useGuestStore } from '../../guest/guestStore';
import { guestApi } from '../../guest/guestApi';
import type {
  ChallengeSettings,
  DelaySettings,
  Page,
  Reminder,
  ReminderCategory,
  ReminderContent,
  ReminderLog,
  ReminderLogStatus,
  ReminderMethod,
  CalendarItem,
  RepeatRule,
  TodayReminder,
} from '../../types';

export interface CreateReminderInput {
  category: ReminderCategory;
  title: string;
  repeatRule: RepeatRule;
  startDate: string;
  times?: string[];
  endDate?: string;
  content?: ReminderContent;
  method?: ReminderMethod;
  delaySettings?: DelaySettings;
  challenge?: ChallengeSettings;
  medicineId?: string;
  isActive?: boolean;
  /** 喝水每日目标（water 分类） */
  waterGoalMl?: number;
}

/** 提醒 API（FR-201~209）——游客模式自动走本地适配层（#1 复用原界面） */
const isGuest = () => useGuestStore.getState().active;

export const remindersApi = {
  list: (params?: { category?: string; isActive?: boolean }) =>
    isGuest() ? Promise.resolve(guestApi.list()) : http.get<Reminder[]>('/reminders', { params }).then((r) => r.data),

  /** 今日概览：将触发 + 已执行（含次数） */
  today: () =>
    isGuest()
      ? Promise.resolve(guestApi.list() as unknown as TodayReminder[])
      : http.get<TodayReminder[]>('/reminders/today').then((r) => r.data),

  /** 指定日期规划（日期切换视图） */
  calendar: (date: string) =>
    isGuest()
      ? Promise.resolve(guestApi.calendar(date))
      : http.get<CalendarItem[]>('/reminders/calendar', { params: { date } }).then((r) => r.data),

  get: (id: string) =>
    isGuest()
      ? Promise.resolve(guestApi.list().find((r) => r.id === id) as Reminder)
      : http.get<Reminder>(`/reminders/${id}`).then((r) => r.data),

  create: (body: CreateReminderInput) =>
    isGuest()
      ? Promise.resolve(guestApi.create(body))
      : http.post<Reminder>('/reminders', body).then((r) => r.data),

  update: (id: string, body: Partial<CreateReminderInput>) =>
    isGuest()
      ? Promise.resolve(guestApi.update(id, body))
      : http.put<Reminder>(`/reminders/${id}`, body).then((r) => r.data),

  remove: (id: string) =>
    isGuest() ? Promise.resolve(guestApi.remove(id)) : http.delete(`/reminders/${id}`).then((r) => r.data),

  setActive: (id: string, isActive: boolean) =>
    isGuest()
      ? Promise.resolve(guestApi.setActive(id, isActive))
      : http.patch<Reminder>(`/reminders/${id}/active`, { isActive }).then((r) => r.data),

  /** 执行上报（幂等：同一 scheduledTime 只记一次） */
  ack: (id: string, body: { status: ReminderLogStatus; scheduledTime: string; delayMinutes?: number; photoUrl?: string }) =>
    isGuest()
      ? Promise.resolve(guestApi.ack(id, body.status, body.scheduledTime))
      : http.post(`/reminders/${id}/ack`, body).then((r) => r.data),

  delay: (id: string, minutes: number) =>
    isGuest()
      ? Promise.resolve({ ok: true })
      : http.post(`/reminders/${id}/delay`, { minutes }).then((r) => r.data),

  logs: (id: string, page = 1, pageSize = 20) =>
    isGuest()
      ? Promise.resolve({ items: [], total: 0, page, pageSize } as Page<ReminderLog>)
      : http.get<Page<ReminderLog>>(`/reminders/${id}/logs`, { params: { page, pageSize } }).then((r) => r.data),
};
