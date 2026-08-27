import { compareSync } from 'bcryptjs';
import type { SeedDataset } from './guestStore';

/**
 * APK 预置离线种子（#17）：
 * - 启动时仅加载并校验 /offline-seed.json（含 asd 全量数据 + passwordHash），
 *   缓存到 localStorage（cuckoo_seed_v2）；**不自动登录**。
 * - 登录页输入 asd + 正确密码 → verifyOfflineLogin() 通过（离线校验）→
 *   以"已登录但未联网"状态进入；密码错误 → 拒绝。
 */
const SEED_FILE = '/offline-seed.json';
const RAW_KEY = 'cuckoo_seed_v2';

export interface SeedUser {
  id: string;
  username: string;
  phone: string | null;
  avatarUrl: string | null;
  healthGoals: string[] | null;
  timezone: string;
  createdAt: string;
  updatedAt?: string;
  passwordHash?: string;
}

export interface SeedFile extends SeedDataset {
  version: number;
  meta?: { exportedAt?: string; counts?: Record<string, number> };
  user: SeedUser;
}

let cached: SeedFile | null = null;

/** 结构校验：返回错误描述（null = 通过） */
export function validateSeed(s: SeedFile): string | null {
  if (!s || typeof s !== 'object') return '种子为空';
  if (!s.user?.id || !s.user?.username) return '缺少 user.id/username';
  if (!s.user.passwordHash) return '缺少 passwordHash（离线登录不可用）';
  if (!Array.isArray(s.reminders)) return 'reminders 不是数组';
  if (!Array.isArray(s.logs)) return 'logs 不是数组';
  const bad = s.reminders.filter(
    (r) => !r.id || !r.title || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.startDate ?? '')),
  );
  if (bad.length) return `有 ${bad.length} 条提醒字段非法（如 id/title/startDate）`;
  const badTimes = s.reminders.filter(
    (r) => !Array.isArray(r.times) || (r.times ?? []).some((t) => !/^\d{2}:\d{2}$/.test(String(t))),
  );
  if (badTimes.length) return `有 ${badTimes.length} 条提醒 times 格式非法`;
  const badLogs = s.logs.filter(
    (l) => !l.id || !l.scheduledTime || Number.isNaN(new Date(l.scheduledTime).getTime()),
  );
  if (badLogs.length) return `有 ${badLogs.length} 条日志时间非法`;
  const dupReminder = s.reminders.filter((r, i) => s.reminders!.findIndex((x) => x.id === r.id) !== i);
  if (dupReminder.length) return `有 ${dupReminder.length} 条重复 reminder id`;
  return null;
}

function toPublicUser(u: SeedUser) {
  const { passwordHash: _ph, ...pub } = u;
  return pub as Omit<SeedUser, 'passwordHash'>;
}

/** 启动引导：拉取并校验种子、缓存本地；不登录。返回种子（失败 = null） */
export async function bootstrapSeed(): Promise<SeedFile | null> {
  try {
    if (cached) return cached;
    try {
      const raw = localStorage.getItem(RAW_KEY);
      if (raw) {
        const s = JSON.parse(raw) as SeedFile;
        if (s?.user?.id && !validateSeed(s)) {
          cached = s;
          return s;
        }
      }
    } catch {
      /* 缓存损坏 → 重新拉取 */
    }
    const res = await fetch(SEED_FILE);
    if (!res.ok) return null;
    const s = (await res.json()) as SeedFile;
    const err = validateSeed(s);
    if (err) {
      console.warn('[seed] 校验失败:', err);
      return null;
    }
    cached = s;
    localStorage.setItem(RAW_KEY, JSON.stringify(s));
    return s;
  } catch {
    return null;
  }
}

/** 离线登录：用户名+密码 → 返回种子用户与数据集（密码错误/不存在 → null） */
export async function verifyOfflineLogin(
  username: string,
  password: string,
): Promise<{ user: Omit<SeedUser, 'passwordHash'>; dataset: SeedDataset } | null> {
  const seed = await bootstrapSeed();
  if (!seed) return null;
  const u = seed.user;
  if (u.username.toLowerCase() !== username.trim().toLowerCase()) return null;
  if (!u.passwordHash) return null;
  let ok = false;
  try {
    ok = compareSync(password, u.passwordHash);
  } catch {
    ok = false;
  }
  if (!ok) return null;
  const dataset: SeedDataset = {
    user: toPublicUser(u),
    settings: seed.settings,
    reminders: seed.reminders,
    logs: seed.logs,
    medicines: seed.medicines,
    plans: seed.plans,
    feed: seed.feed,
    templates: seed.templates,
    groups: seed.groups,
    followings: seed.followings,
    favorites: seed.favorites,
    notifications: seed.notifications,
    exercises: seed.exercises,
  };
  return { user: toPublicUser(u), dataset };
}
