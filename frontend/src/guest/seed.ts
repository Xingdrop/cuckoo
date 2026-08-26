import { useAuthStore } from '../stores/authStore';
import { useGuestStore } from './guestStore';
import type { GuestReminder } from './guestStore';

const SEED_FLAG = (id: string) => `cuckoo_seed_consumed_${id}`;

interface SeedFile {
  version: number;
  meta?: { exportedAt?: string };
  user: { id: string; username: string; avatarUrl?: string | null; [k: string]: unknown };
  reminders?: Array<{
    id: string;
    title: string;
    category: string;
    times?: string[] | null;
    startDate: string;
    createdAt: string;
    isActive?: boolean;
  }>;
  logs?: Array<{ id: string; reminderId?: string | null; scheduledTime?: string; status?: string; amount?: number; createdAt?: string }>;
}

/**
 * APK 预置离线账户（#16）：
 * 首次启动读取 public/offline-seed.json（asd 数据）→ 以本地离线账户登录（免密），
 * 数据进入镜像层；后续启动不再重复导入（flag 标记）。
 */
export async function bootstrapSeed(): Promise<boolean> {
  try {
    const res = await fetch('/offline-seed.json');
    if (!res.ok) return false;
    const seed = (await res.json()) as SeedFile;
    if (!seed?.user?.id || !seed.user.username) return false;
    if (localStorage.getItem(SEED_FLAG(seed.user.id))) return false;

    // 1) 伪登录态：本地离线账户
    useAuthStore.getState().setUser(seed.user as never);
    // 2) 镜像数据（离线优先）
    const store = useGuestStore.getState();
    const reminders: GuestReminder[] = (seed.reminders ?? []).map((r) => ({
      id: r.id,
      title: r.title ?? '未命名',
      category: r.category ?? 'custom',
      times: r.times?.length ? [...r.times] : [],
      startDate: (r.startDate ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      createdAt: r.createdAt ?? new Date().toISOString(),
      isActive: r.isActive !== false,
    }));
    // 3) 日志导入（logs 供打卡/水统计）
    useGuestStore.setState({
      reminders,
      logs: (seed.logs ?? []).map((l) => ({
        id: l.id,
        reminderId: l.reminderId ?? null,
        scheduledTime: l.scheduledTime ?? new Date().toISOString(),
        status: (l.status as 'completed' | 'skipped' | 'delayed' | 'missed') ?? 'completed',
        amount: l.amount ?? 0,
        createdAt: l.createdAt ?? l.scheduledTime ?? new Date().toISOString(),
      })),
      // seed 模式标记：离线账户恒走本地
      mirrorOf: `seed:${seed.user.id}`,
    });
    store.setMirror(`seed:${seed.user.id}`);
    localStorage.setItem(SEED_FLAG(seed.user.id), '1');
    return true;
  } catch {
    return false;
  }
}
