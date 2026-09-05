/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3V0aWxzL3JlbWluZGVyLXNjaGVkdWxlLnRzfDIwMjYtMDl8NzA5ZDJmOTc1MQ== */
import type { IntervalUnit, RepeatRule } from '../types';

/**
 * 提醒调度算法（与 backend/src/common/reminder-schedule.ts 同源实现，双端单测保持一致）。
 * 修改任意一端必须同步另一端并跑双端单测。
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

/** 绝对时间 → 用户时区的本地时间分量（兼容 string 输入） */
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

/** 用户时区某日期的 "本地 hh:mm" → 绝对时间（UTC Date） */
export function localToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i++) {
    const got = toLocal(new Date(guess), timezone);
    const diffMin = (got.hour * 60 + got.minute) - (hour * 60 + minute);
    const diffDay = Date.UTC(got.year, got.month - 1, got.day) - Date.UTC(year, month - 1, day);
    if (diffMin === 0 && diffDay === 0) break;
    guess -= diffDay + diffMin * 60_000;
  }
  return new Date(guess);
}

function atTimeOnDate(
  tz: string,
  triggerLocal: { hour: number; minute: number },
  year: number,
  month: number,
  day: number,
): Date {
  return localToUtc(tz, year, month, day, triggerLocal.hour, triggerLocal.minute);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function expandCandidates(
  rule: RepeatRule,
  from: Date,
  startDate: Date,
  timezone: string,
  endDate: Date | null,
): Date[] {
  const triggerLocal = toLocal(startDate, timezone);
  const fromLocal = toLocal(from, timezone);
  const candidates: Date[] = [];
  const maxDays = 400;

  for (let offset = 0; offset <= maxDays; offset++) {
    const day = new Date(
      Date.UTC(fromLocal.year, fromLocal.month - 1, fromLocal.day) + offset * 86_400_000,
    );
    const local = toLocal(day, timezone);
    let matched = false;

    switch (rule.type) {
      case 'daily':
        matched = true;
        break;
      case 'weekly': {
        const days = rule.daysOfWeek ?? [];
        matched = days.length === 0 ? true : days.includes(local.weekday);
        break;
      }
      case 'monthly': {
        const target = Math.min(rule.dayOfMonth ?? 1, lastDayOfMonth(local.year, local.month));
        matched = local.day === target;
        break;
      }
      default:
        matched = false;
    }

    if (matched) {
      const t = atTimeOnDate(timezone, triggerLocal, local.year, local.month, local.day);
      if (t > from) {
        if (endDate && t > endDate) return candidates;
        candidates.push(t);
        if (rule.type === 'daily' || rule.type === 'weekly') break;
      }
    }

    if (offset === maxDays) return candidates;
  }
  return candidates;
}

/** 计算下一次触发时间（严格大于 from）；无下一次返回 null */
export function computeNextTrigger(
  rule: RepeatRule,
  from: Date,
  startDate: Date,
  endDate: Date | null = null,
  timezone = 'Asia/Shanghai',
): Date | null {
  switch (rule.type) {
    case 'once':
      if (startDate > from && (!endDate || startDate <= endDate)) return new Date(startDate);
      return null;

    case 'interval': {
      const unit = rule.intervalUnit ?? ('day' as IntervalUnit);
      const value = Math.max(1, rule.intervalValue ?? 1);
      // 按小时：每天从 startDate 时刻起每 N 小时循环（到午夜重置）
      if (unit === 'hour') {
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
      const stepMs = unit === 'week' ? value * 7 * 86_400_000 : value * 86_400_000;
      const first = new Date(startDate);
      if (first > from && (!endDate || first <= endDate)) return first;
      const gap = Math.ceil((from.getTime() - first.getTime()) / stepMs);
      const next = new Date(first.getTime() + Math.max(1, gap) * stepMs);
      return endDate && next > endDate ? null : next;
    }

    case 'daily':
    case 'weekly':
    case 'monthly': {
      const candidates = expandCandidates(rule, from, startDate, timezone, endDate);
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => a.getTime() - b.getTime());
      const next = candidates[0];
      return endDate && next > endDate ? null : next;
    }

    default:
      return null;
  }
}

/** 触发后重排 */
export function computeFollowingTrigger(
  rule: RepeatRule,
  after: Date,
  startDate: Date,
  endDate: Date | null = null,
  timezone = 'Asia/Shanghai',
): Date | null {
  if (rule.type === 'once') return null;
  return computeNextTrigger(rule, after, startDate, endDate, timezone);
}
