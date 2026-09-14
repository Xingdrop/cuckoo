/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9hY2hpZXZlbWVudHMvYWNoaWV2ZW1lbnQtcnVsZXMuc3BlYy50c3wyMDI2LTA5fDEyZDY4NWY4Mjk= */ */
import { metricFor, pendingAchievements } from './achievement-rules';
import type { AchievementRule, AchievementType } from './achievement.entity';

describe('成就规则匹配（UT-COMMON-06）', () => {
  const rules = [
    { type: 'streak_7', threshold: 7 },
    { type: 'streak_30', threshold: 30 },
    { type: 'medication_100', threshold: 100 },
    { type: 'exercise_50', threshold: 50 },
    { type: 'water_200', threshold: 200 },
  ] as AchievementRule[];

  it('metricFor：规则 type 映射到对应指标', () => {
    const m = { streakDays: 7, medicationCount: 100, exerciseCount: 50, waterCount: 200 };
    expect(metricFor('streak_7', m)).toBe(7);
    expect(metricFor('medication_100', m)).toBe(100);
    expect(metricFor('water_200', m)).toBe(200);
  });

  it('达到阈值且未达成 → 待解锁', () => {
    const m = { streakDays: 7, medicationCount: 50, exerciseCount: 50, waterCount: 100 };
    const pending = pendingAchievements(rules, m, new Set());
    expect(pending.map((r) => r.type).sort()).toEqual(['exercise_50', 'streak_7']);
  });

  it('已达成的不重复解锁', () => {
    const m = { streakDays: 30, medicationCount: 100, exerciseCount: 50, waterCount: 200 };
    const pending = pendingAchievements(rules, m, new Set(['streak_7', 'streak_30']));
    expect(pending.map((r) => r.type).sort()).toEqual(['exercise_50', 'medication_100', 'water_200']);
  });

  it('未达阈值 → 不解锁', () => {
    const m = { streakDays: 6, medicationCount: 99, exerciseCount: 49, waterCount: 199 };
    expect(pendingAchievements(rules, m, new Set())).toEqual([]);
  });
});
