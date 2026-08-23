import type { AchievementRule, AchievementType } from './achievement.entity';

/** 指标快照（成就 check 的输入） */
export interface Metrics {
  streakDays: number;
  medicationCount: number;
  exerciseCount: number;
  waterCount: number;
}

/** 规则 type → 当前指标值 */
export function metricFor(type: AchievementType, m: Metrics): number {
  switch (type) {
    case 'streak_7':
    case 'streak_30':
    case 'streak_100':
    case 'streak_365':
      return m.streakDays;
    case 'medication_100':
      return m.medicationCount;
    case 'exercise_50':
      return m.exerciseCount;
    case 'water_200':
      return m.waterCount;
    default:
      return 0;
  }
}

/** 未达成（指标达到阈值但未入表）的目标规则 */
export function pendingAchievements(
  rules: AchievementRule[],
  metrics: Metrics,
  achievedTypes: Set<string>,
): AchievementRule[] {
  return rules.filter((r) => !achievedTypes.has(r.type) && metricFor(r.type, metrics) >= r.threshold);
}
