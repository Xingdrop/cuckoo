/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3NlcnZpY2VzL2FwaS9hcGkucmVtaW5kZXJzLnRzfDIwMjYtMDl8Njk3M2RiOGVjNA== */
import { http } from '../http';
import { useLocal } from '../../guest/localMode';
import { guestApi } from '../../guest/guestApi';
import { recordCloudDelete } from '../../guest/guestStore';
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
  /** 喝水每日目标（water 分类） */
  waterGoalMl?: number;
}

/** 提醒 API（FR-201~209）——游客/离线镜像自动走本地适配层（复用原界面） */
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
    useLocal()
      ? Promise.resolve(guestApi.remove(id))
      : http
          .delete(`/reminders/${id}`)
          .then((r) => {
            // 2026-09-07：镜像同步删除+墓碑，防重登回灌复活
            recordCloudDelete('reminders', id);
            return r.data;
          }),

  setActive: (id: string, isActive: boolean) =>
    useLocal()
      ? Promise.resolve(guestApi.setActive(id, isActive))
      : http.patch<Reminder>(`/reminders/${id}/active`, { isActive }).then((r) => r.data),

  /** 执行上报（幂等：同一 scheduledTime 只记一次） */
  ack: (id: string, body: { status: ReminderLogStatus; scheduledTime: string; delayMinutes?: number; photoUrl?: string; note?: string }) =>
    useLocal()
      ? Promise.resolve(guestApi.ack(id, body.status, body.scheduledTime, body.photoUrl, body.note))
      : http.post(`/reminders/${id}/ack`, body).then((r) => r.data),

  delay: (id: string, minutes: number) =>
    useLocal()
      ? Promise.resolve({ ok: true })
      : http.post(`/reminders/${id}/delay`, { minutes }).then((r) => r.data),

  logs: (id: string, page = 1, pageSize = 20) =>
    useLocal()
      ? Promise.resolve(guestApi.logs(id, page, pageSize))
      : http.get<Page<ReminderLog>>(`/reminders/${id}/logs`, { params: { page, pageSize } }).then((r) => r.data),

  /** #26：替换某条日志的照片（保留记录） */
  updateLogPhoto: (logId: string, photoUrl: string) =>
    useLocal()
      ? Promise.resolve(guestApi.updateLogPhoto(logId, photoUrl))
      : http.post(`/reminders/logs/${logId}/photo`, { photoUrl }).then((r) => r.data),
};



