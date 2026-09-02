import { http } from '../http';
import { useLocal } from '../../guest/localMode';
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
  /** #20：是否计入完成率（默认 true） */
  countInRate?: boolean;
  /** 鍠濇按姣忔棩鐩爣锛坵ater 鍒嗙被锛?*/
  waterGoalMl?: number;
}

/** 鎻愰啋 API锛團R-201~209锛夆€斺€旀父瀹?绂荤嚎闀滃儚鑷姩璧版湰鍦伴€傞厤灞傦紙澶嶇敤鍘熺晫闈級 */
export const remindersApi = {
  list: (params?: { category?: string; isActive?: boolean }) =>
    useLocal() ? Promise.resolve(guestApi.list()) : http.get<Reminder[]>('/reminders', { params }).then((r) => r.data),

  /** 浠婃棩姒傝锛氬皢瑙﹀彂 + 宸叉墽琛岋紙鍚鏁帮級 */
  today: () =>
    useLocal()
      ? Promise.resolve(guestApi.list() as unknown as TodayReminder[])
      : http.get<TodayReminder[]>('/reminders/today').then((r) => r.data),

  /** 鎸囧畾鏃ユ湡瑙勫垝锛堟棩鏈熷垏鎹㈣鍥撅級 */
  calendar: (date: string) =>
    useLocal()
      ? Promise.resolve(guestApi.calendar(date))
      : http.get<CalendarItem[]>('/reminders/calendar', { params: { date } }).then((r) => r.data),

  get: (id: string) =>
    useLocal()
      ? Promise.resolve(guestApi.list().find((r) => r.id === id) as Reminder)
      : http.get<Reminder>(`/reminders/${id}`).then((r) => r.data),

  create: (body: CreateReminderInput) =>
    useLocal()
      ? Promise.resolve(guestApi.create(body))
      : http.post<Reminder>('/reminders', body).then((r) => r.data),

  update: (id: string, body: Partial<CreateReminderInput>) =>
    useLocal()
      ? Promise.resolve(guestApi.update(id, body))
      : http.put<Reminder>(`/reminders/${id}`, body).then((r) => r.data),

  remove: (id: string) =>
    useLocal() ? Promise.resolve(guestApi.remove(id)) : http.delete(`/reminders/${id}`).then((r) => r.data),

  setActive: (id: string, isActive: boolean) =>
    useLocal()
      ? Promise.resolve(guestApi.setActive(id, isActive))
      : http.patch<Reminder>(`/reminders/${id}/active`, { isActive }).then((r) => r.data),

  /** 鎵ц涓婃姤锛堝箓绛夛細鍚屼竴 scheduledTime 鍙涓€娆★級 */
  ack: (id: string, body: { status: ReminderLogStatus; scheduledTime: string; delayMinutes?: number; photoUrl?: string }) =>
    useLocal()
      ? Promise.resolve(guestApi.ack(id, body.status, body.scheduledTime))
      : http.post(`/reminders/${id}/ack`, body).then((r) => r.data),

  delay: (id: string, minutes: number) =>
    useLocal()
      ? Promise.resolve({ ok: true })
      : http.post(`/reminders/${id}/delay`, { minutes }).then((r) => r.data),

  logs: (id: string, page = 1, pageSize = 20) =>
    useLocal()
      ? Promise.resolve(guestApi.logs(id, page, pageSize))
      : http.get<Page<ReminderLog>>(`/reminders/${id}/logs`, { params: { page, pageSize } }).then((r) => r.data),
};



