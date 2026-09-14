/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3R5cGVzL2luZGV4LnRzfDIwMjYtMDl8ODBmOTUwY2NkNw== */ */
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
  /** 每日喝水目标（ml） */
  waterGoalMl: number;
  /** 喝水达标是否计入完成率（#13，旧开关——已由 #20/#26 面板勾选取代） */
  waterInRate: boolean;
  /** #26：喝水（当日达标）作为完成率可选统计项 */
  waterCountInRate?: boolean;
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
  /** 外部视频/链接（2026-08 #2：跳转到其它视频 App 平台） */
  linkUrl?: string;
  jumpTo?: string;
  /** 每次喝水量（ml，water 分类） */
  waterAmountMl?: number;
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
  /** 自定义分类名称（category=custom 时） */
  categoryLabel: string | null;
  /** 自定义分类图标（emoji） */
  categoryIcon: string | null;
  title: string;
  repeatRule: RepeatRule;
  startDate: string;
  /** 每日多时间点（HH:mm，daily/weekly 适用） */
  times: string[] | null;
  endDate: string | null;
  nextTriggerAt: string | null;
  /** 所属计划 id（2026-08："我的计划"归属） */
  planId?: string | null;
  /** 所属计划名（2026-08：来自"我的计划"） */
  planName?: string | null;
  /** 计划提醒被用户修改过（2026-08：显示"已修改"徽标） */
  modifiedFromPlan?: boolean;
  /** #20：是否计入完成率（今日完成率方框逐条勾选；默认 true） */
  countInRate?: boolean;
  content: ReminderContent;
  method: ReminderMethod;
  delaySettings: DelaySettings;
  challenge: ChallengeSettings;
  medicineId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 今日概览项（GET /reminders/today） */
export interface TodayReminder extends Reminder {
  todayLogs: { id: string; scheduledTime: string; status: ReminderLogStatus }[];
  /** 今日计划总次数（多时间点 = 时间点数量，其余 = 1） */
  todayTotal: number;
}

export type ReminderLogStatus =
  | 'completed'
  | 'delayed'
  | 'skipped'
  | 'missed'
  | 'challenge_completed'
  | 'manual'
  | 'photo'
  /** #58（2026-09-09）：纯留言记录（不改完成状态；完成时自动升级） */
  | 'note';

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
  medicineNameSnapshot: string | null;
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

/** 指定日期规划项（GET /reminders/calendar） */
export interface CalendarItem {
  reminderId: string;
  nextTriggerAt: string | null;
  title: string;
  category: ReminderCategory;
  categoryLabel: string | null;
  categoryIcon: string | null;
  content: ReminderContent;
  times: { time: string; status: ReminderLogStatus | null; delayMinutes?: number }[];
  todayTotal: number;
  /** 不定时每日提醒：不显示具体时间（2026-08） */
  untimed?: boolean;
  /** 重复规则（2026-08 间隔提醒聚合展示用） */
  repeatRule?: RepeatRule;
  /** #20：是否计入完成率 */
  countInRate?: boolean;
}

/** 药品（M2） */
export interface Medicine {
  id: string;
  userId: string;
  name: string;
  dosage: string | null;
  administration: string | null;
  stock: number;
  threshold: number;
  expiryDate: string | null;
  instructions: string | null;
  photoUrl: string | null;
  /** #25：多张药品照片 */
  photoUrls?: string[] | null;
  deductionPerUse: number;
  notifyOnLowStock: boolean;
  createdAt: string;
  updatedAt: string;
}
