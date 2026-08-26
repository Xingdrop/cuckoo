import { http } from '../http';
import { useGuestStore } from '../../guest/guestStore';
import { guestApi } from '../../guest/guestApi';

/** 缁熻 API锛團R-701~707锛夆€斺€旀父瀹㈡ā寮忚蛋鏈湴閫傞厤灞?*/
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

/** #4锛氭煇鏃ュ枬姘寸粺璁★紙鎸夌敤鎴锋椂鍖烘棩鐣岀嫭绔嬶級 */
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

const useLocal = () => {
  const g = useGuestStore.getState();
  // #16：seed 离线账户恒走本地；其他镜像仅断网时本地
  return g.active || (g.mirrorOf !== null && (g.mirrorOf.startsWith('seed:') || !navigator.onLine));
};

export const statsApi = {
  dashboard: () =>
    useLocal() ? Promise.resolve(guestApi.dashboard()) : http.get<DashboardStats>('/stats/dashboard').then((r) => r.data),

  heatmap: (month: string) =>
    useLocal()
      ? Promise.resolve(guestApi.heatmap())
      : http.get<DayStat[]>('/stats/heatmap', { params: { month } }).then((r) => r.data),

  trend: (days = 7) =>
    useLocal()
      ? Promise.resolve(guestApi.trend())
      : http.get<DayStat[]>('/stats/trend', { params: { days } }).then((r) => r.data),

  /** 鏌愭棩鍠濇按缁熻锛堢己鐪佷粖澶╋級 */
  waterInfo: (date?: string) =>
    useLocal()
      ? Promise.resolve(guestApi.waterInfo(date))
      : http.get<WaterInfo>('/stats/water', { params: { date } }).then((r) => r.data),

  /** 鎵嬪姩璁板綍鍠濇按锛?4锛氬彲鎸囧畾鏃ユ湡锛岄粯璁や粖澶╋級 */
  water: (amountMl: number, date?: string) =>
    useLocal()
      ? Promise.resolve(guestApi.water(amountMl))
      : http.post<WaterInfo>('/stats/water', { amountMl, ...(date ? { date } : {}) }).then((r) => r.data),
};



