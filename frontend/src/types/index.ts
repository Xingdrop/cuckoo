/**
 * 全局类型定义（与后端 DTO/实体字段一一对齐，见 docs/技术方案设计.md §6）
 * 后端字段变更时必须同步本文件。
 */

// ---- 用户 ----
export interface User {
  id: string;
  username: string;
  phone: string | null;
  avatarUrl: string | null;
  healthGoals: string[] | null;
  timezone: string;
  createdAt: string;
}

export interface UserSettings {
  userId: string;
  notificationEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  theme: string;
  missedThresholdMinutes: number;
  showSkipButton: boolean;
  maxDelayCount: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// ---- 提醒 ----
export type ReminderCategory = 'medication' | 'exercise' | 'water' | 'rest' | 'work' | 'custom';
export type RepeatType = 'once' | 'daily' | 'weekly' | 'monthly' | 'interval';
export type IntervalUnit = 'day' | 'hour' | 'week';

export interface RepeatRule {
  type: RepeatType;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  intervalValue?: number;
  intervalUnit?: IntervalUnit;
}

export interface ReminderContent {
  text?: string;
  imageUrls?: string[];
  videoUrl?: string;
  jumpTo?: string;
}

export interface ReminderMethod {
  fullScreen?: boolean;
  sound?: string;
  vibrationEnabled?: boolean;
  gradualSound?: boolean;
}

export interface DelaySettings {
  presetOptions?: number[];
  customEnabled?: boolean;
  maxDelayCount?: number;
}

export interface ChallengeSettings {
  enabled?: boolean;
  allowGallery?: boolean;
}

export interface Reminder {
  id: string;
  userId: string;
  category: ReminderCategory;
  title: string;
  repeatRule: RepeatRule;
  startDate: string;
  endDate: string | null;
  nextTriggerAt: string | null;
  content: ReminderContent;
  method: ReminderMethod;
  delaySettings: DelaySettings;
  challenge: ChallengeSettings;
  medicineId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ReminderLogStatus =
  | 'completed'
  | 'delayed'
  | 'skipped'
  | 'missed'
  | 'challenge_completed'
  | 'manual';

export interface ReminderLog {
  id: string;
  reminderId: string;
  userId: string;
  scheduledTime: string;
  actualTime: string | null;
  status: ReminderLogStatus;
  delayMinutes: number;
  photoUrl: string | null;
  medicineId: string | null;
  stockDeducted: number;
}

// ---- API 通用 ----
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}
