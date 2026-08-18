import {
  computeFollowingTrigger,
  computeNextTrigger,
  toLocal,
} from './reminder-schedule';
import { IntervalUnit, RepeatType } from '../modules/reminders/reminder.entity';

const TZ = 'Asia/Shanghai'; // UTC+8，无夏令时

describe('UT-SCH-01 单次提醒', () => {
  const start = new Date('2026-08-20T10:00:00Z');
  it('未到期返回 startDate 本身', () => {
    const next = computeNextTrigger(
      { type: RepeatType.ONCE },
      new Date('2026-08-19T00:00:00Z'),
      start,
      null,
      TZ,
    );
    expect(next?.toISOString()).toBe('2026-08-20T10:00:00.000Z');
  });
  it('已过期返回 null', () => {
    const next = computeNextTrigger(
      { type: RepeatType.ONCE },
      new Date('2026-08-21T00:00:00Z'),
      start,
      null,
      TZ,
    );
    expect(next).toBeNull();
  });
});

describe('UT-SCH-02 每天重复', () => {
  it('触发时刻已过后 → 次日同一时刻', () => {
    // startDate = 本地 08:00 (=UTC 00:00)
    const start = new Date('2026-08-20T00:00:00Z');
    const next = computeNextTrigger(
      { type: RepeatType.DAILY },
      new Date('2026-08-20T00:00:00Z'),
      start,
      null,
      TZ,
    );
    expect(next?.toISOString()).toBe('2026-08-21T00:00:00.000Z');
  });
  it('触发时刻未到 → 当天同一时刻', () => {
    const start = new Date('2026-08-20T00:00:00Z');
    const next = computeNextTrigger(
      { type: RepeatType.DAILY },
      new Date('2026-08-19T12:00:00Z'),
      start,
      null,
      TZ,
    );
    expect(next?.toISOString()).toBe('2026-08-20T00:00:00.000Z');
  });
});

describe('UT-SCH-03 每 N 天', () => {
  it('每 3 天', () => {
    const start = new Date('2026-08-20T00:00:00Z');
    const next = computeNextTrigger(
      { type: RepeatType.INTERVAL, intervalValue: 3, intervalUnit: IntervalUnit.DAY },
      new Date('2026-08-20T00:00:00Z'),
      start,
      null,
      TZ,
    );
    expect(next?.toISOString()).toBe('2026-08-23T00:00:00.000Z');
  });
});

describe('UT-SCH-04 每周多选', () => {
  it('周二 from → 最近周三（Mon=1,Wed=3,Fri=5）', () => {
    // 2026-08-17 是周一
    const start = new Date('2026-08-17T00:00:00Z');
    // 2026-08-18 是周二
    const next = computeNextTrigger(
      { type: RepeatType.WEEKLY, daysOfWeek: [1, 3, 5] },
      new Date('2026-08-18T00:00:00Z'),
      start,
      null,
      TZ,
    );
    expect(next?.toISOString()).toBe('2026-08-19T00:00:00.000Z');
  });
  it('周一下午 from → 跨周到下周一', () => {
    const start = new Date('2026-08-17T00:00:00Z'); // 周一 08:00 本地
    const next = computeNextTrigger(
      { type: RepeatType.WEEKLY, daysOfWeek: [1] },
      new Date('2026-08-17T04:00:00Z'), // 周一 12:00 本地（已过）
      start,
      null,
      TZ,
    );
    expect(next?.toISOString()).toBe('2026-08-24T00:00:00.000Z');
  });
});

describe('UT-SCH-05 每月固定日', () => {
  it('每月 15 日', () => {
    const start = new Date('2026-01-15T00:00:00Z');
    const next = computeNextTrigger(
      { type: RepeatType.MONTHLY, dayOfMonth: 15 },
      new Date('2026-01-20T00:00:00Z'),
      start,
      null,
      TZ,
    );
    expect(next?.toISOString()).toBe('2026-02-15T00:00:00.000Z');
  });
});

describe('UT-SCH-06 每月 31 日遇小月顺延', () => {
  it('1/31 from → 2 月末日（2026 非闰年 → 2/28）', () => {
    const start = new Date('2026-01-31T00:00:00Z');
    const next = computeNextTrigger(
      { type: RepeatType.MONTHLY, dayOfMonth: 31 },
      new Date('2026-01-31T00:00:00Z'),
      start,
      null,
      TZ,
    );
    expect(next?.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
});

describe('UT-SCH-07 每 N 小时', () => {
  it('每 6 小时', () => {
    const start = new Date('2026-08-20T00:00:00Z');
    const next = computeNextTrigger(
      { type: RepeatType.INTERVAL, intervalValue: 6, intervalUnit: IntervalUnit.HOUR },
      new Date('2026-08-20T04:00:00Z'),
      start,
      null,
      TZ,
    );
    // 档位: 00:00Z, 06:00Z, 12:00Z...；from=04:00Z 之后最近为 06:00Z
    expect(next?.toISOString()).toBe('2026-08-20T06:00:00.000Z');
  });
});

describe('UT-SCH-08 已过时间跳过', () => {
  it('当天触发点已过 → 计算到下一周期', () => {
    const start = new Date('2026-08-20T00:00:00Z');
    const next = computeNextTrigger(
      { type: RepeatType.DAILY },
      new Date('2026-08-20T04:00:00Z'), // 本地 12:00，08:00 已过
      start,
      null,
      TZ,
    );
    expect(next?.toISOString()).toBe('2026-08-21T00:00:00.000Z');
  });
});

describe('UT-SCH-09 endDate 边界', () => {
  it('触发点 = endDate 允许', () => {
    const start = new Date('2026-08-20T00:00:00Z');
    const next = computeNextTrigger(
      { type: RepeatType.DAILY },
      new Date('2026-08-20T00:00:00Z'),
      start,
      new Date('2026-08-21T00:00:00Z'),
      TZ,
    );
    expect(next?.toISOString()).toBe('2026-08-21T00:00:00.000Z');
  });
  it('超过 endDate → null', () => {
    const start = new Date('2026-08-20T00:00:00Z');
    const next = computeNextTrigger(
      { type: RepeatType.DAILY },
      new Date('2026-08-21T00:00:00Z'),
      start,
      new Date('2026-08-21T00:00:00Z'),
      TZ,
    );
    expect(next).toBeNull();
  });
});

describe('UT-SCH-10 时区处理', () => {
  it('UTC+8 与本地时刻换算一致', () => {
    // 2026-08-20T07:00:00Z = 北京 15:00
    const local = toLocal(new Date('2026-08-20T07:00:00Z'), TZ);
    expect(local.hour).toBe(15);
    expect(local.day).toBe(20);
  });
  it('洛杉矶（有 DST）本地 00:00 重复提醒', () => {
    // PDT = UTC-7：UTC 07:00 = 洛杉矶 00:00
    const start = new Date('2026-07-15T07:00:00Z');
    const next = computeNextTrigger(
      { type: RepeatType.DAILY },
      new Date('2026-07-15T07:00:00Z'),
      start,
      null,
      'America/Los_Angeles',
    );
    expect(next?.toISOString()).toBe('2026-07-16T07:00:00.000Z');
  });
});

describe('computeFollowingTrigger（触发后重排）', () => {
  it('daily 完成后 → 次日', () => {
    const start = new Date('2026-08-20T00:00:00Z');
    const next = computeFollowingTrigger(
      { type: RepeatType.DAILY },
      new Date('2026-08-20T00:00:00Z'),
      start,
      null,
      TZ,
    );
    expect(next?.toISOString()).toBe('2026-08-21T00:00:00.000Z');
  });
  it('once 无后续', () => {
    const start = new Date('2026-08-20T10:00:00Z');
    expect(
      computeFollowingTrigger({ type: RepeatType.ONCE }, start, start, null, TZ),
    ).toBeNull();
  });
});
