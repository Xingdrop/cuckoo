import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 游客模式（#2）：数据仅保存在本机（localStorage）；
 * 升级时导出 exportBundle() → 登录后 POST /users/me/import（#3 云端按 created_at 较新合并）。
 */

export interface GuestReminder {
  id: string;
  title: string;
  category: string;
  times: string[]; // HH:mm（无 = 不定时）
  startDate: string; // YYYY-MM-DD
  createdAt: string; // ISO（合并优先级）
  isActive: boolean;
}

export interface GuestLog {
  id: string;
  reminderId: string | null;
  scheduledTime: string; // ISO
  status: 'completed' | 'skipped' | 'delayed' | 'missed';
  amount: number;
  createdAt: string;
}

interface GuestState {
  active: boolean;
  reminders: GuestReminder[];
  logs: GuestLog[];
  activate: () => void;
  deactivate: () => void;
  saveReminder: (r: Omit<GuestReminder, 'id' | 'createdAt'>) => void;
  removeReminder: (id: string) => void;
  ack: (id: string, status: 'completed' | 'skipped') => void;
  recordWater: (ml: number) => void;
  todayWater: () => number;
  exportBundle: () => {
    reminders: unknown[];
    logs: unknown[];
    exportedAt: string;
  };
  clear: () => void;
}

const nowIso = () => new Date().toISOString();
const todayKey = () => nowIso().slice(0, 10);

export const useGuestStore = create<GuestState>()(
  persist(
    (set, get) => ({
      active: false,
      reminders: [],
      logs: [],

      activate: () => set({ active: true }),
      deactivate: () => set({ active: false }),

      saveReminder: (r) =>
        set((s) => ({
          reminders: [
            { ...r, id: `g-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, createdAt: nowIso() },
            ...s.reminders,
          ],
        })),

      removeReminder: (id) =>
        set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) })),

      ack: (id, status) =>
        set((s) => {
          const dayStart = new Date(`${todayKey()}T00:00:00`);
          const noon = new Date(dayStart.getTime() + 12 * 3_600_000);
          return {
            logs: [
              ...s.logs,
              {
                id: `l-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
                reminderId: id,
                scheduledTime: noon.toISOString(),
                status,
                amount: 0,
                createdAt: nowIso(),
              },
            ],
          };
        }),

      recordWater: (ml) =>
        set((s) => ({
          logs: [
            ...s.logs,
            {
              id: `l-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
              reminderId: null,
              scheduledTime: nowIso(),
              status: 'completed',
              amount: ml,
              createdAt: nowIso(),
            },
          ],
        })),

      todayWater: () =>
        get().logs
          .filter((l) => l.amount > 0 && l.scheduledTime.slice(0, 10) === todayKey())
          .reduce((sum, l) => sum + l.amount, 0),

      exportBundle: () => ({
        reminders: get().reminders.map((r) => ({
          id: r.id,
          title: r.title,
          category: r.category,
          repeatRule: { type: r.times.length ? 'daily' : 'daily' },
          times: r.times.length ? r.times : null,
          startDate: r.startDate,
          content: {},
          createdAt: r.createdAt,
          isActive: r.isActive,
        })),
        logs: get().logs.map((l) => ({
          id: l.id,
          reminderId: l.reminderId,
          scheduledTime: l.scheduledTime,
          actualTime: l.scheduledTime,
          status: l.status,
          amount: l.amount,
          category: 'custom',
          createdAt: l.createdAt,
        })),
        exportedAt: nowIso(),
      }),

      clear: () => set({ active: false, reminders: [], logs: [] }),
    }),
    { name: 'cuckoo_guest' },
  ),
);
