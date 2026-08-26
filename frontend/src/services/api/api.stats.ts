import { http } from '../http';
import { useGuestStore } from '../../guest/guestStore';
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
}

export interface DayStat {
  date: string;
  planned: number;
  done: number;
  rate: number;
}

const isGuest = () => useGuestStore.getState().active;

export const statsApi = {
  dashboard: () =>
    isGuest() ? Promise.resolve(guestApi.dashboard()) : http.get<DashboardStats>('/stats/dashboard').then((r) => r.data),

  heatmap: (month: string) =>
    isGuest()
      ? Promise.resolve(guestApi.heatmap())
      : http.get<DayStat[]>('/stats/heatmap', { params: { month } }).then((r) => r.data),

  trend: (days = 7) =>
    isGuest()
      ? Promise.resolve(guestApi.trend())
      : http.get<DayStat[]>('/stats/trend', { params: { days } }).then((r) => r.data),

  /** 某日喝水统计（缺省今天） */
  waterInfo: (date?: string) =>
    isGuest()
      ? Promise.resolve(guestApi.waterInfo(date))
      : http.get<WaterInfo>('/stats/water', { params: { date } }).then((r) => r.data),

  /** 手动记录喝水（#4：可指定日期，默认今天） */
  water: (amountMl: number, date?: string) =>
    isGuest()
      ? Promise.resolve(guestApi.water(amountMl))
      : http.post<WaterInfo>('/stats/water', { amountMl, ...(date ? { date } : {}) }).then((r) => r.data),
};
