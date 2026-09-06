/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3NlcnZpY2VzL2FwaS9hcGkuYWNoaWV2ZW1lbnRzLnRzfDIwMjYtMDl8Nzk2OTM2N2ZmMg== */
import { http } from '../http';

export interface AchievementRuleView {
  type: string;
  name: string;
  description: string;
  icon: string;
  threshold: number;
  unit: string;
  current: number;
  achieved: boolean;
  achievedAt: string | null;
}

export interface AchievementWall {
  metrics: { streakDays: number; medicationCount: number; exerciseCount: number; waterCount: number };
  rules: AchievementRuleView[];
  unlockedCount: number;
}

export const achievementsApi = {
  wall: () => http.get<AchievementWall>('/achievements').then((r) => r.data),
  check: () => http.post<unknown[]>('/achievements/check').then((r) => r.data),
};
