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
  water: { waterMl: number; waterGoalMl: number; rate: number };
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

  /** 手动记录喝水 */
  water: (amountMl: number) =>
    http.post('/stats/water', { amountMl }).then((r) => r.data),
};
