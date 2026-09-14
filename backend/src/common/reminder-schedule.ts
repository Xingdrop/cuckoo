/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvY29tbW9uL3JlbWluZGVyLXNjaGVkdWxlLnRzfDIwMjYtMDl8NmUzZTQ4Y2IyZg== */ */
import { IntervalUnit, RepeatRule, RepeatType } from '../modules/reminders/reminder.entity';

/**
 * 提醒调度算法（纯函数，前后端同源实现，双端必须保持单测一致）。
 *
 * 规则：重复提醒以 startDate 在用户时区的时间分量（时:分）为触发时刻，
 * 日期部分按 repeatRule 展开；返回严格大于 from 的下一次触发绝对时间（UTC Date）。
 *
 * - once     → startDate 本身（已过期返回 null）
 * - daily    → 每天同一时刻
 * - weekly   → daysOfWeek 中最近的星期几（同一时刻）
 * - monthly  → dayOfMonth 日（>28 时遇小月顺延到月末）
 * - interval → 从 startDate 起每 N day/hour/week
 * - endDate 到达后返回 null
 */

export interface LocalDateTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=Sun .. 6=Sat
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** 绝对时间 → 用户时区的本地时间分量（兼容 string 输入：ORM 从 SQLite 读出的日期是字符串） */
export function toLocal(d: Date | string, timezone: string): LocalDateTime {
  const date = d instanceof Date ? d : new Date(d);
  const parts = partsFormatter(timezone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour: parseInt(get('hour'), 10) % 24,
    minute: parseInt(get('minute'), 10),
    weekday: weekdayMap[get('weekday')] ?? 0,
  };
}

/** 用户时区某日期的 "本地 hh:mm" → 绝对时间（UTC Date）。用迭代校正处理 DST/偏移。 */
export function localToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  // 迭代校正：got 比目标晚 → 向前推；早 → 向后推（1~2 次内收敛）
  for (let i = 0; i < 3; i++) {
    const got = toLocal(new Date(guess), timezone);
    const diffMin =
      (got.hour * 60 + got.minute) - (hour * 60 + minute);
    const diffDay = Date.UTC(got.year, got.month - 1, got.day) - Date.UTC(year, month - 1, day);
    if (diffMin === 0 && diffDay === 0) break;
    guess -= diffDay + diffMin * 60_000;
  }
  return new Date(guess);
}

/** 某本地日期（用户时区）的触发时刻 → 绝对时间 */
function atTimeOnDate(
  tz: string,
  triggerLocal: { hour: number; minute: number },
  year: number,
  month: number,
  day: number,
): Date {
  return localToUtc(tz, year, month, day, triggerLocal.hour, triggerLocal.minute);
}

/** 月的最后一天（dayOfMonth > 28 时顺延） */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 展开候选触发时刻（本地日期维度），返回所有 > from 的最近候选，由调用方取最早 */
function expandCandidates(
  rule: RepeatRule,
  from: Date,
  startDate: Date,
  timezone: string,
  endDate: Date | null,
  times: string[] | null = null,
): Date[] {
  const triggerLocal = toLocal(startDate, timezone);
  const fromLocal = toLocal(from, timezone);
  const candidates: Date[] = [];
  // 最多向后扫描 400 天（覆盖 13 个月），避免死循环
  const maxDays = 400;

  for (let offset = 0; offset <= maxDays; offset++) {
    const day = new Date(Date.UTC(fromLocal.year, fromLocal.month - 1, fromLocal.day) + offset * 86_400_000);
    const local = toLocal(day, timezone);
    let matched = false;

    switch (rule.type) {
      case RepeatType.DAILY:
        matched = true;
        break;
      case RepeatType.WEEKLY: {
        const days = rule.daysOfWeek ?? [];
        matched = days.length === 0 ? true : days.includes(local.weekday);
        break;
      }
      case RepeatType.MONTHLY: {
        const target = Math.min(rule.dayOfMonth ?? 1, lastDayOfMonth(local.year, local.month));
        matched = local.day === target;
        break;
      }
      default:
        matched = false;
    }

    if (matched) {
      // 多时间点模式：当天所有时间点都是候选（daily/weekly 适用）
      if (times && times.length > 0) {
        const parsed = times
          .map((t) => {
            const [h, mi] = t.split(':').map(Number);
            return { hour: h, minute: mi };
          })
          .filter((t) => Number.isFinite(t.hour) && Number.isFinite(t.minute))
          .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
        let added = false;
        for (const t of parsed) {
          const cand = atTimeOnDate(timezone, t, local.year, local.month, local.day);
          if (cand > from) {
            if (endDate && cand > endDate) return candidates;
            candidates.push(cand);
            added = true;
          }
        }
        // 当天有未过期的时间点 → 当天候选必然早于后续日期，停止扫描
        if (added) break;
      } else {
        const t = atTimeOnDate(timezone, triggerLocal, local.year, local.month, local.day);
        if (t > from) {
          if (endDate && t > endDate) return candidates;
          candidates.push(t);
          // 每天重复/周重复：取最近一个即可（避免生成大量候选）
          if (rule.type === RepeatType.DAILY || rule.type === RepeatType.WEEKLY) break;
        }
      }
    }

    if (offset === maxDays) return candidates;
  }
  return candidates;
}

/** 计算下一次触发时间（严格大于 from）；无下一次返回 null。times 为每日多时间点（HH:mm） */
export function computeNextTrigger(
  rule: RepeatRule,
  from: Date,
  startDate: Date,
  endDate: Date | null = null,
  timezone = 'Asia/Shanghai',
  times: string[] | null = null,
): Date | null {
  switch (rule.type) {
    case RepeatType.ONCE:
      if (startDate > from && (!endDate || startDate <= endDate)) return new Date(startDate);
      return null;

    case RepeatType.INTERVAL: {
      const unit = rule.intervalUnit ?? IntervalUnit.DAY;
      const value = Math.max(1, rule.intervalValue ?? 1);
      // 按小时：每天从 startDate 时刻起每 N 小时循环（到午夜重置）
      if (unit === IntervalUnit.HOUR) {
        const stepMs = value * 3_600_000;
        const fromLocal = toLocal(from, timezone);
        const startLocal = toLocal(startDate, timezone);
        const dayBase = localToUtc(
          timezone,
          fromLocal.year,
          fromLocal.month,
          fromLocal.day,
          startLocal.hour,
          startLocal.minute,
        ).getTime();
        const dayEnd = localToUtc(
          timezone,
          fromLocal.year,
          fromLocal.month,
          fromLocal.day + 1,
          0,
          0,
        ).getTime();
        let next: number;
        if (dayBase > from.getTime()) {
          next = dayBase;
        } else {
          const gap = Math.max(1, Math.ceil((from.getTime() - dayBase) / stepMs));
          next = dayBase + gap * stepMs;
        }
        if (next >= dayEnd) {
          // 次日从 startTime 重新开始
          next = localToUtc(
            timezone,
            fromLocal.year,
            fromLocal.month,
            fromLocal.day + 1,
            startLocal.hour,
            startLocal.minute,
          ).getTime();
        }
        const nextDate = new Date(next);
        return endDate && nextDate > endDate ? null : nextDate;
      }
      // 按天/周：从 startDate 起每 N 天/周（绝对间隔）
      const stepMs =
        unit === IntervalUnit.WEEK ? value * 7 * 86_400_000 : value * 86_400_000;
      const first = new Date(startDate);
      if (first > from && (!endDate || first <= endDate)) return first;
      const gap = Math.ceil((from.getTime() - first.getTime()) / stepMs);
      const next = new Date(first.getTime() + Math.max(1, gap) * stepMs);
      return endDate && next > endDate ? null : next;
    }

    case RepeatType.DAILY:
    case RepeatType.WEEKLY:
    case RepeatType.MONTHLY: {
      const candidates = expandCandidates(rule, from, startDate, timezone, endDate, times);
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => a.getTime() - b.getTime());
      const next = candidates[0];
      return endDate && next > endDate ? null : next;
    }

    default:
      return null;
  }
}

/** 计算某次触发后的下一次（用于执行/延迟后重排） */
export function computeFollowingTrigger(
  rule: RepeatRule,
  after: Date,
  startDate: Date,
  endDate: Date | null = null,
  timezone = 'Asia/Shanghai',
  times: string[] | null = null,
): Date | null {
  if (rule.type === RepeatType.ONCE) return null;
  return computeNextTrigger(rule, after, startDate, endDate, timezone, times);
}
