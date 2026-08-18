import { http } from '../http';
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
  RepeatRule,
} from '../../types';

export interface CreateReminderInput {
  category: ReminderCategory;
  title: string;
  repeatRule: RepeatRule;
  startDate: string;
  endDate?: string;
  content?: ReminderContent;
  method?: ReminderMethod;
  delaySettings?: DelaySettings;
  challenge?: ChallengeSettings;
  medicineId?: string;
  isActive?: boolean;
}

/** 提醒 API（FR-201~209） */
export const remindersApi = {
  list: (params?: { category?: string; isActive?: boolean }) =>
    http.get<Reminder[]>('/reminders', { params }).then((r) => r.data),

  get: (id: string) => http.get<Reminder>(`/reminders/${id}`).then((r) => r.data),

  create: (body: CreateReminderInput) =>
    http.post<Reminder>('/reminders', body).then((r) => r.data),

  update: (id: string, body: Partial<CreateReminderInput>) =>
    http.put<Reminder>(`/reminders/${id}`, body).then((r) => r.data),

  remove: (id: string) => http.delete(`/reminders/${id}`).then((r) => r.data),

  setActive: (id: string, isActive: boolean) =>
    http.patch<Reminder>(`/reminders/${id}/active`, { isActive }).then((r) => r.data),

  /** 执行上报（幂等：同一 scheduledTime 只记一次） */
  ack: (id: string, body: { status: ReminderLogStatus; scheduledTime: string; delayMinutes?: number; photoUrl?: string }) =>
    http.post(`/reminders/${id}/ack`, body).then((r) => r.data),

  delay: (id: string, minutes: number) =>
    http.post(`/reminders/${id}/delay`, { minutes }).then((r) => r.data),

  logs: (id: string, page = 1, pageSize = 20) =>
    http.get<Page<ReminderLog>>(`/reminders/${id}/logs`, { params: { page, pageSize } }).then((r) => r.data),
};
