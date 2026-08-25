import { http } from '../http';

/** 统计 API（FR-701~707） */
export interface DashboardStats {
  date: string;
  planned: number;
  done: number;
  rate: number;
  missed: number;
  streakDays: number;
  categoryStats: Record<string, { planned: number; done: number; rate: number }>;
  water: WaterInfo;
}

/** #4：某日喝水统计（按用户时区日界独立） */
export interface WaterInfo {
  date: string;
  waterMl: number;
  waterGoalMl: number;
  rate: number;
  reached: boolean;
}

export interface DayStat {
  date: string;
  planned: number;
  done: number;
  rate: number;
}

export const statsApi = {
  dashboard: () => http.get<DashboardStats>('/stats/dashboard').then((r) => r.data),

  heatmap: (month: string) =>
    http.get<DayStat[]>('/stats/heatmap', { params: { month } }).then((r) => r.data),

  trend: (days = 7) =>
    http.get<DayStat[]>('/stats/trend', { params: { days } }).then((r) => r.data),

  /** 某日喝水统计（缺省今天） */
  waterInfo: (date?: string) =>
    http.get<WaterInfo>('/stats/water', { params: { date } }).then((r) => r.data),

  /** 手动记录喝水（#4：可指定日期，默认今天） */
  water: (amountMl: number, date?: string) =>
    http.post<WaterInfo>('/stats/water', { amountMl, ...(date ? { date } : {}) }).then((r) => r.data),
};
