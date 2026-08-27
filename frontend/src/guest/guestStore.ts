import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 本地数据层（#17 离线优先架构）：
 * - 游客 / 离线账户（seed 镜像）/ 在线账户 共用一个本地数据集，按上下文（owner）隔离存档
 * - 游客模式（active=true）与离线账户（mirrorOf='seed:<uid>'）本地读写走 guestApi 适配层
 * - 升级时 exportBundle() → 登录后 POST /users/me/import（云端按更新时间较新合并）
 */

export interface GuestReminder {
  id: string;
  title: string;
  category: string;
  times: string[]; // HH:mm（无 = 不定时）
  startDate: string; // YYYY-MM-DD
  /** 起始时刻（HH:mm）——按小时间隔提醒用于生成本日时点 */
  startHour?: string;
  createdAt: string; // ISO（合并优先级）
  updatedAt?: string;
  isActive: boolean;
  repeatRule?: { type: string; daysOfWeek?: number[]; dayOfMonth?: number; intervalValue?: number; intervalUnit?: string };
  content?: Record<string, unknown>;
  endDate?: string | null;
  planId?: string | null;
  planName?: string | null;
  categoryLabel?: string | null;
  categoryIcon?: string | null;
  medicineId?: string | null;
}

export interface GuestLog {
  id: string;
  reminderId: string | null;
  scheduledTime: string; // ISO
  status: 'completed' | 'skipped' | 'delayed' | 'missed' | 'challenge_completed' | 'manual';
  amount: number;
  createdAt: string;
}

export interface GuestMedicine {
  id: string;
  name: string;
  dosage?: string | null;
  administration?: string | null;
  stock: number;
  threshold: number;
  expiryDate?: string | null;
  instructions?: string | null;
  photoUrl?: string | null;
  deductionPerUse: number;
  notifyOnLowStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GuestPlan {
  id: string;
  name: string;
  description?: string;
  sourceType?: 'self' | 'official' | 'share';
  sourceTitle?: string | null;
  sourceId?: string | null;
  isActive: boolean;
  createdAt: string;
  reminderCount?: number;
  /** #18：加入计划保存的提醒配置（开启开关时重建提醒） */
  config?: Array<Record<string, unknown>> | null;
}

export interface GuestSettings {
  waterGoalMl: number;
  waterInRate: boolean;
}

export interface GuestFeedPost {
  id: string;
  userId: string;
  type: string;
  content: string;
  mediaUrls: string[];
  planSnapshot: Record<string, unknown> | null;
  likesCount: number;
  commentsCount: number;
  joinedCount: number;
  createdAt: string;
  updatedAt?: string;
  myLiked: boolean;
  myFavorited: boolean;
  myJoined: boolean;
  author: { id: string; username: string; avatarUrl: string | null };
}

export interface GuestTemplate {
  id: string;
  title: string;
  description: string;
  reminderConfig: Record<string, unknown>[];
  mediaUrls: string[];
  version: number;
}

export interface GuestGroup {
  id: string;
  name: string;
  description: string;
  coverUrl: string | null;
  ownerId: string | null;
  memberCount: number;
}

export interface GuestNotification {
  id: string;
  type: string;
  title: string;
  content: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface GuestExercise {
  id: string;
  name: string;
  steps: string;
  imageUrl: string | null;
  videoUrl: string | null;
  durationSeconds: number;
  category: string;
  sortOrder: number;
  isActive: boolean;
}

/** 种子（offline-seed.json）导入载荷 —— 与 seed.ts SeedFile 对齐 */
export interface SeedDataset {
  user: {
    id: string;
    username: string;
    phone?: string | null;
    avatarUrl?: string | null;
    healthGoals?: string[] | null;
    timezone?: string;
    createdAt?: string;
    updatedAt?: string;
    passwordHash?: string;
  };
  settings?: Partial<GuestSettings> & { userId?: string };
  reminders?: GuestReminder[];
  logs?: GuestLog[];
  medicines?: GuestMedicine[];
  plans?: GuestPlan[];
  posts?: unknown[];
  feed?: GuestFeedPost[];
  templates?: GuestTemplate[];
  groups?: GuestGroup[];
  followings?: string[];
  favorites?: string[];
  notifications?: GuestNotification[];
  exercises?: GuestExercise[];
}

const nowIso = () => new Date().toISOString();
const todayKey = () => nowIso().slice(0, 10);
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const DEFAULT_SETTINGS: GuestSettings = { waterGoalMl: 2000, waterInRate: false };

type Owner = { mode: 'guest' | 'seed' | 'online'; userId: string } | null;

interface GuestState {
  active: boolean;
  owner: Owner;
  reminders: GuestReminder[];
  logs: GuestLog[];
  medicines: GuestMedicine[];
  plans: GuestPlan[];
  settings: GuestSettings;
  feed: GuestFeedPost[];
  templates: GuestTemplate[];
  groups: GuestGroup[];
  exercises: GuestExercise[];
  followings: string[];
  favorites: string[];
  notifications: GuestNotification[];
  /** #15：离线镜像所属账号（'seed:<uid>' = 种子离线账户；'online' = 在线账户镜像） */
  mirrorOf: string | null;

  activate: () => void;
  deactivate: () => void;
  /** 登录（在线/离线种子）：切换到该账户的本地数据集 */
  loginAccount: (userId: string, mode: 'seed' | 'online') => void;
  /** 退出登录：保留当前数据集，便于下次登录恢复 */
  logoutAccount: () => void;
  /** 导入种子数据集（离线登录成功时调用） */
  seedDataset: (d: SeedDataset, userId: string) => void;
  /** 手动持久化当前数据集到该账户的存档 key */
  saveNow: () => void;

  saveReminder: (r: Omit<GuestReminder, 'id' | 'createdAt'>) => void;
  /** 指定 id 插入（计划配置重建提醒用） */
  insertReminder: (r: GuestReminder) => void;
  updateReminder: (id: string, patch: Partial<GuestReminder>) => void;
  removeReminder: (id: string) => void;
  ack: (id: string, status: 'completed' | 'skipped', at?: string) => void;
  recordWater: (ml: number) => void;
  todayWater: () => number;

  saveMedicine: (m: Omit<GuestMedicine, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateMedicine: (id: string, patch: Partial<GuestMedicine>) => void;
  removeMedicine: (id: string) => void;

  savePlan: (p: { name: string; description?: string }) => void;
  patchPlan: (id: string, patch: Partial<GuestPlan>) => void;
  /** 仅切换计划开关标志（不联动提醒——供"删除提醒→计划自动关"用） */
  patchPlanFlag: (id: string, isActive: boolean) => void;
  removePlan: (id: string) => void;

  saveSettings: (patch: Partial<GuestSettings>) => void;
  seedSocial: (
    d: Partial<
      Pick<SeedDataset, 'feed' | 'templates' | 'groups' | 'exercises' | 'followings' | 'favorites' | 'notifications'>
    >,
  ) => void;

  exportBundle: () => {
    reminders: unknown[];
    logs: unknown[];
    medicines: unknown[];
    plans: unknown[];
    settings: Partial<GuestSettings> & { updatedAt: string };
    exportedAt: string;
  };
  clear: () => void;
  setMirror: (userId: string) => void;
  clearMirror: () => void;
}

const COLLECTIONS = [
  'reminders', 'logs', 'medicines', 'plans', 'settings', 'feed', 'templates', 'groups',
  'exercises', 'followings', 'favorites', 'notifications',
] as const;

/** 存档 key（owner 缺失时 null = 无存档） */
const archiveKey = (owner: Owner): string | null =>
  owner ? (owner.mode === 'guest' ? 'guest' : `acct:${owner.userId}`) : null;

const emptyDataset = () => ({
  active: false,
  reminders: [] as GuestReminder[],
  logs: [] as GuestLog[],
  medicines: [] as GuestMedicine[],
  plans: [] as GuestPlan[],
  settings: { ...DEFAULT_SETTINGS },
  feed: [] as GuestFeedPost[],
  templates: [] as GuestTemplate[],
  groups: [] as GuestGroup[],
  exercises: [] as GuestExercise[],
  followings: [] as string[],
  favorites: [] as string[],
  notifications: [] as GuestNotification[],
  mirrorOf: null,
});

function loadArchive(key: string): Partial<ReturnType<typeof emptyDataset>> {
  try {
    const raw = localStorage.getItem(`cuckoo_local:${key}`);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<ReturnType<typeof emptyDataset>>;
  } catch {
    return {};
  }
}

export const useGuestStore = create<GuestState>()(
  persist(
    (set, get) => {
      /** 把当前数据集快照写入 owner 存档（防切换上下文丢数据） */
      const persistNow = () => {
        const key = archiveKey(get().owner);
        if (!key) return;
        const s = get();
        const snap: Record<string, unknown> = { active: s.active, mirrorOf: s.mirrorOf };
        for (const c of COLLECTIONS) snap[c] = s[c];
        try {
          localStorage.setItem(`cuckoo_local:${key}`, JSON.stringify(snap));
        } catch {
          /* 存储满等异常静默 */
        }
      };
      /** 载入存档到 store（默认空数据集） */
      const adopt = (owner: Owner, active: boolean, mirrorOf: string | null) => {
        const key = archiveKey(owner);
        const loaded = key ? loadArchive(key) : {};
        const base = emptyDataset();
        const merged = { ...base, ...loaded } as ReturnType<typeof emptyDataset> & { settings?: GuestSettings };
        set({
          owner,
          active,
          mirrorOf: mirrorOf ?? merged.mirrorOf ?? null,
          reminders: (merged.reminders ?? []) as GuestReminder[],
          logs: (merged.logs ?? []) as GuestLog[],
          medicines: (merged.medicines ?? []) as GuestMedicine[],
          plans: (merged.plans ?? []) as GuestPlan[],
          settings: { ...DEFAULT_SETTINGS, ...(merged.settings ?? {}) },
          feed: (merged.feed ?? []) as GuestFeedPost[],
          templates: (merged.templates ?? []) as GuestTemplate[],
          groups: (merged.groups ?? []) as GuestGroup[],
          exercises: (merged.exercises ?? []) as GuestExercise[],
          followings: (merged.followings ?? []) as string[],
          favorites: (merged.favorites ?? []) as string[],
          notifications: (merged.notifications ?? []) as GuestNotification[],
        });
      };

      return {
        active: false,
        owner: null,
        reminders: [],
        logs: [],
        medicines: [],
        plans: [],
        settings: { ...DEFAULT_SETTINGS },
        feed: [],
        templates: [],
        groups: [],
        exercises: [],
        followings: [],
        favorites: [],
        notifications: [],
        mirrorOf: null,

        activate: () => {
          persistNow();
          adopt({ mode: 'guest', userId: 'guest' }, true, null);
        },
        deactivate: () => set({ active: false }),

        loginAccount: (userId, mode) => {
          persistNow();
          adopt({ mode, userId }, false, mode === 'seed' ? `seed:${userId}` : 'online');
        },

        logoutAccount: () => {
          persistNow();
        },

        seedDataset: (d, userId) => {
          persistNow();
          adopt({ mode: 'seed', userId }, false, `seed:${userId}`);
          const s = get();
          const patch: Partial<GuestState> = {};
          if (d.reminders?.length) patch.reminders = d.reminders;
          if (d.logs?.length) patch.logs = d.logs;
          if (d.medicines?.length) patch.medicines = d.medicines;
          if (d.plans?.length) patch.plans = d.plans;
          if (d.settings) patch.settings = { ...DEFAULT_SETTINGS, ...d.settings };
          patch.feed = d.feed ?? [];
          patch.templates = d.templates ?? [];
          patch.groups = d.groups ?? [];
          patch.exercises = d.exercises ?? [];
          patch.followings = d.followings ?? [];
          patch.favorites = d.favorites ?? [];
          patch.notifications = d.notifications ?? [];
          set(patch);
          persistNow();
          void s;
        },

        saveNow: () => persistNow(),

        saveReminder: (r) => {
          set((s) => ({
            reminders: [
              {
                ...r,
                id: uid('g'),
                createdAt: nowIso(),
                updatedAt: nowIso(),
                repeatRule: r.repeatRule ?? { type: r.times.length ? 'daily' : 'daily' },
                content: r.content ?? {},
              },
              ...s.reminders,
            ],
          }));
          persistNow();
        },

        insertReminder: (r) => {
          set((s) => ({ reminders: [r, ...s.reminders] }));
          persistNow();
        },

        updateReminder: (id, patch) => {
          set((s) => ({
            reminders: s.reminders.map((r) =>
              r.id === id ? { ...r, ...patch, updatedAt: nowIso() } : r,
            ),
          }));
          persistNow();
        },

        removeReminder: (id) => {
          set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) }));
          persistNow();
        },

        ack: (id, status, at) => {
          set((s) => ({
            logs: [
              ...s.logs,
              {
                id: uid('l'),
                reminderId: id,
                scheduledTime: at ?? new Date(`${todayKey()}T12:00:00`).toISOString(),
                status,
                amount: 0,
                createdAt: nowIso(),
              },
            ],
          }));
          persistNow();
        },

        recordWater: (ml) => {
          set((s) => ({
            logs: [
              ...s.logs,
              {
                id: uid('l'),
                reminderId: null,
                scheduledTime: nowIso(),
                status: 'completed',
                amount: ml,
                createdAt: nowIso(),
              },
            ],
          }));
          persistNow();
        },

        todayWater: () =>
          get().logs
            .filter((l) => l.amount > 0 && l.scheduledTime.slice(0, 10) === todayKey())
            .reduce((sum, l) => sum + l.amount, 0),

        saveMedicine: (m) => {
          const now = nowIso();
          set((s) => ({
            medicines: [
              { ...m, id: uid('m'), createdAt: now, updatedAt: now },
              ...s.medicines,
            ],
          }));
          persistNow();
        },
        updateMedicine: (id, patch) => {
          set((s) => ({
            medicines: s.medicines.map((m) =>
              m.id === id ? { ...m, ...patch, updatedAt: nowIso() } : m,
            ),
          }));
          persistNow();
        },
        removeMedicine: (id) => {
          set((s) => ({ medicines: s.medicines.filter((m) => m.id !== id) }));
          persistNow();
        },

        savePlan: (p) => {
          set((s) => ({
            plans: [
              { id: uid('p'), name: p.name, description: p.description ?? '', sourceType: 'self', isActive: true, createdAt: nowIso(), reminderCount: 0, config: null },
              ...s.plans,
            ],
          }));
          persistNow();
        },
        patchPlan: (id, patch) => {
          set((s) => ({
            plans: s.plans.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          }));
          persistNow();
        },
        patchPlanFlag: (id, isActive) => {
          set((s) => ({
            plans: s.plans.map((p) => (p.id === id ? { ...p, isActive } : p)),
          }));
          persistNow();
        },
        removePlan: (id) => {
          set((s) => ({ plans: s.plans.filter((p) => p.id !== id) }));
          persistNow();
        },

        saveSettings: (patch) => {
          set((s) => ({ settings: { ...s.settings, ...patch } }));
          persistNow();
        },

        seedSocial: (d) => {
          set((s) => ({
            feed: d.feed ?? s.feed,
            templates: d.templates ?? s.templates,
            groups: d.groups ?? s.groups,
            exercises: d.exercises ?? s.exercises,
            followings: d.followings ?? s.followings,
            favorites: d.favorites ?? s.favorites,
            notifications: d.notifications ?? s.notifications,
          }));
          persistNow();
        },

        exportBundle: () => ({
          reminders: get().reminders.map((r) => ({
            id: r.id,
            title: r.title,
            category: r.category,
            categoryLabel: r.categoryLabel ?? null,
            categoryIcon: r.categoryIcon ?? null,
            repeatRule: r.repeatRule ?? { type: 'daily' },
            times: r.times.length ? r.times : null,
            startDate: r.startDate,
            endDate: r.endDate ?? null,
            content: r.content ?? {},
            planId: r.planId ?? null,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt ?? r.createdAt,
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
          medicines: get().medicines.map((m) => ({
            id: m.id,
            name: m.name,
            dosage: m.dosage ?? null,
            stock: m.stock,
            threshold: m.threshold,
            deductionPerUse: m.deductionPerUse,
            notifyOnLowStock: m.notifyOnLowStock,
            administration: m.administration ?? null,
            instructions: m.instructions ?? null,
            expiryDate: m.expiryDate ?? null,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
          })),
          plans: get().plans.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description ?? '',
            sourceType: p.sourceType ?? 'self',
            sourceTitle: p.sourceTitle ?? null,
            sourceId: p.sourceId ?? null,
            isActive: p.isActive,
            createdAt: p.createdAt,
            updatedAt: p.createdAt,
          })),
          settings: { ...get().settings, updatedAt: nowIso() },
          exportedAt: nowIso(),
        }),

        clear: () => {
          const key = archiveKey(get().owner);
          if (key) {
            try {
              localStorage.removeItem(`cuckoo_local:${key}`);
            } catch {
              /* 忽略 */
            }
          }
          set({ owner: null, ...emptyDataset() });
        },

        setMirror: (userId) => set({ mirrorOf: userId }),
        clearMirror: () =>
          set((s) => ({
            mirrorOf: null,
            // 镜像数据清除（游客数据仅在游客模式下保留）
            reminders: s.active ? s.reminders : [],
            logs: s.active ? s.logs : [],
          })),
      };
    },
    {
      name: 'cuckoo_guest',
      partialize: (s) => ({
        active: s.active,
        owner: s.owner,
        reminders: s.reminders,
        logs: s.logs,
        medicines: s.medicines,
        plans: s.plans,
        settings: s.settings,
        feed: s.feed,
        templates: s.templates,
        groups: s.groups,
        exercises: s.exercises,
        followings: s.followings,
        favorites: s.favorites,
        notifications: s.notifications,
        mirrorOf: s.mirrorOf,
      }),
    },
  ),
);

/** 当前是否处于「本地数据模式」（游客 / 离线镜像），供 api 层 useLocal 使用 */
export const isLocalMode = (): boolean => {
  const g = useGuestStore.getState();
  return g.active || (g.mirrorOf !== null && g.mirrorOf.startsWith('seed:'));
};
