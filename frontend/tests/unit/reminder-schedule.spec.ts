import { describe, expect, it } from 'vitest';
import { computeNextTrigger, toLocal } from '../../src/utils/reminder-schedule';
import type { Reminder } from '../../src/types';
import { pickNextReminder } from '../../src/features/reminders/useReminderScheduler';

const TZ = 'Asia/Shanghai';

describe('UT-FE-01 调度引擎（与后端同源一致性）', () => {
  it('每天重复：触发后 → 次日同一时刻', () => {
    const start = new Date('2026-08-20T00:00:00Z');
    const next = computeNextTrigger({ type: 'daily' }, new Date('2026-08-20T00:00:00Z'), start, null, TZ);
    expect(next?.toISOString()).toBe('2026-08-21T00:00:00.000Z');
  });

  it('每周多选：周二 → 最近周三', () => {
    const start = new Date('2026-08-17T00:00:00Z');
    const next = computeNextTrigger(
      { type: 'weekly', daysOfWeek: [1, 3, 5] },
      new Date('2026-08-18T00:00:00Z'),
      start,
      null,
      TZ,
    );
    expect(next?.toISOString()).toBe('2026-08-19T00:00:00.000Z');
  });

  it('每月 31 日遇小月顺延', () => {
    const start = new Date('2026-01-31T00:00:00Z');
    const next = computeNextTrigger(
      { type: 'monthly', dayOfMonth: 31 },
      new Date('2026-01-31T00:00:00Z'),
      start,
      null,
      TZ,
    );
    expect(next?.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });

  it('自定义间隔（每 3 天）', () => {
    const start = new Date('2026-08-20T00:00:00Z');
    const next = computeNextTrigger(
      { type: 'interval', intervalValue: 3, intervalUnit: 'day' },
      new Date('2026-08-20T00:00:00Z'),
      start,
      null,
      TZ,
    );
    expect(next?.toISOString()).toBe('2026-08-23T00:00:00.000Z');
  });

  it('单次已过期 → null', () => {
    const start = new Date('2026-08-20T10:00:00Z');
    expect(computeNextTrigger({ type: 'once' }, new Date('2026-08-21T00:00:00Z'), start, null, TZ)).toBeNull();
  });

  it('时区换算：UTC+8 本地时刻正确', () => {
    const local = toLocal(new Date('2026-08-20T07:00:00Z'), TZ);
    expect(local.hour).toBe(15);
    expect(local.day).toBe(20);
  });
});

describe('pickNextReminder（本地调度选下一个）', () => {
  const base: Reminder = {
    id: 'r1', userId: 'u1', category: 'water', title: 't',
    repeatRule: { type: 'daily' }, startDate: '2026-08-18T00:00:00Z', endDate: null,
    nextTriggerAt: null, content: {}, method: {}, delaySettings: {}, challenge: {},
    medicineId: null, isActive: true, createdAt: '', updatedAt: '',
  };
  const now = new Date('2026-08-18T06:00:00Z');

  it('选出最近到期的活动提醒', () => {
    const later = { ...base, id: 'r2', nextTriggerAt: '2026-08-18T08:00:00Z' };
    const earlier = { ...base, id: 'r1', nextTriggerAt: '2026-08-18T07:00:00Z' };
    expect(pickNextReminder([later, earlier], now)?.id).toBe('r1');
  });

  it('停用/无 next/已过期的不参与', () => {
    const inactive = { ...base, id: 'r2', isActive: false, nextTriggerAt: '2026-08-18T07:00:00Z' };
    const past = { ...base, id: 'r3', nextTriggerAt: '2026-08-18T05:00:00Z' };
    const noNext = { ...base, id: 'r4', nextTriggerAt: null };
    expect(pickNextReminder([inactive, past, noNext], now)).toBeNull();
  });

  it('全部为空返回 null', () => {
    expect(pickNextReminder([], now)).toBeNull();
  });
});
