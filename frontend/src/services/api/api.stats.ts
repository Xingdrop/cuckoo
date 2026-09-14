/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3NlcnZpY2VzL2FwaS9hcGkuc3RhdHMudHN8MjAyNi0wOXw5MjIwYTc2MDZh */
import { http } from '../http';
import { useLocal } from '../../guest/localMode';
import { guestApi } from '../../guest/guestApi';

/** 统计 API（FR-701~707）——游客模式走本地适配层 */
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
  /** #7：连续达标天数（今天未达标不打断——从昨天起算） */
  streakDays: number;
}

export interface DayStat {
  date: string;
  planned: number;
  done: number;
  rate: number;
}

export const statsApi = {
  dashboard: () =>
    useLocal() ? Promise.resolve(guestApi.dashboard()) : http.get<DashboardStats>('/stats/dashboard').then((r) => r.data),

  heatmap: (month: string) =>
    useLocal()
      ? Promise.resolve(guestApi.heatmap(month))
      : http.get<DayStat[]>('/stats/heatmap', { params: { month } }).then((r) => r.data),

  trend: (days = 7) =>
    useLocal()
      ? Promise.resolve(guestApi.trend(days))
      : http.get<DayStat[]>('/stats/trend', { params: { days } }).then((r) => r.data),

  /** 某日喝水统计（缺省今天） */
  waterInfo: (date?: string) =>
    useLocal()
      ? Promise.resolve(guestApi.waterInfo(date))
      : http.get<WaterInfo>('/stats/water', { params: { date } }).then((r) => r.data),

  /** 手动记录喝水（#4：可指定日期，默认今天） */
  water: (amountMl: number, date?: string) =>
    useLocal()
      ? Promise.resolve(guestApi.water(amountMl))
      : http.post<WaterInfo>('/stats/water', { amountMl, ...(date ? { date } : {}) }).then((r) => r.data),
};



