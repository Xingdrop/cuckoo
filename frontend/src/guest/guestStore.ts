/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL2d1ZXN0L2d1ZXN0U3RvcmUudHN8MjAyNi0wOXw5MjQ0Y2I3MGIy */
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
  /** #20：是否计入完成率（默认 true） */
  countInRate?: boolean;
}

export interface GuestLog {
  id: string;
  reminderId: string | null;
  scheduledTime: string; // ISO
  status: 'completed' | 'skipped' | 'delayed' | 'missed' | 'challenge_completed' | 'manual' | 'photo' | 'note';
  amount: number;
  createdAt: string;
  /** 2026-09-06：可选文字记录（提醒弹窗随手记） */
  note?: string | null;
  /** #26/#58：拍照记录（拍照/挑战打卡/补拍） */
  photoUrl?: string | null;
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
  /** #25：多张药品照片 */
  photoUrls?: string[] | null;
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
  notificationEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  theme: string;
  missedThresholdMinutes: number;
  showSkipButton: boolean;
  maxDelayCount: number;
  /** 每日喝水目标（ml） */
  waterGoalMl: number;
  /** 兼容字段（#20 起不再使用——完成率改按提醒勾选） */
  waterInRate?: boolean;
  /** #26：喝水（当日达标）作为完成率可选统计项 */
  waterCountInRate?: boolean;
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
  followings?: string[];
  favorites?: string[];
  notifications?: GuestNotification[];
  exercises?: GuestExercise[];
}

const nowIso = () => new Date().toISOString();
const todayKey = () => nowIso().slice(0, 10);
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const DEFAULT_SETTINGS: GuestSettings = {
  notificationEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  theme: 'default',
  missedThresholdMinutes: 30,
  showSkipButton: false,
  maxDelayCount: 3,
  waterGoalMl: 2000,
  waterInRate: false,
  waterCountInRate: false,
};

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
  exercises: GuestExercise[];
  followings: string[];
  favorites: string[];
  notifications: GuestNotification[];
  /** #15：离线镜像所属账号（'seed:<uid>' = 种子离线账户；'online' = 在线账户镜像） */
  mirrorOf: string | null;
  /** 2026-09-06：离线删除墓碑——记录镜像期间删除的 id，同步时通知云端真删（否则 upsert 合并会"复活"） */
  deleted: { reminders: string[]; medicines: string[]; plans: string[] };

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
  /** #26：日志带照片（拍照/挑战打卡） */
  photoUrl?: string | null;

  ack: (
    id: string,
    status: 'completed' | 'skipped' | 'photo' | 'note' | 'missed' | 'delayed' | 'challenge_completed' | 'manual',
    at?: string,
    photoUrl?: string,
    note?: string,
  ) => void;
  /** #26：替换某条日志的照片（保留原记录与时间语义） */
  updateLogPhoto: (logId: string, photoUrl: string) => void;
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
      Pick<SeedDataset, 'feed' | 'templates' | 'exercises' | 'followings' | 'favorites' | 'notifications'>
    >,
  ) => void;
  /** #22：把游客数据集合并进当前账户（按 id + updatedAt 较新）；返回 {merged, skipped} */
  mergeGuestData: () => { merged: number; skipped: number };
  /** #24：清空游客数据（注销本地账户）——清状态 + 归档 + 本地存储 */
  clearGuestData: () => void;

  exportBundle: () => {
    reminders: unknown[];
    logs: unknown[];
    medicines: unknown[];
    plans: unknown[];
    settings: Partial<GuestSettings> & { updatedAt: string };
    deleted?: { reminders: string[]; medicines: string[]; plans: string[] };
    exportedAt: string;
  };
  /** 同步成功后清空墓碑（云端已确认删除） */
  clearTombstones: () => void;
  clear: () => void;
  setMirror: (userId: string) => void;
  clearMirror: () => void;
}

const COLLECTIONS = [
  'reminders', 'logs', 'medicines', 'plans', 'settings', 'feed', 'templates',
  'exercises', 'followings', 'favorites', 'notifications', 'deleted',
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
  exercises: [] as GuestExercise[],
  followings: [] as string[],
  favorites: [] as string[],
  notifications: [] as GuestNotification[],
  mirrorOf: null,
  deleted: { reminders: [] as string[], medicines: [] as string[], plans: [] as string[] },
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
          exercises: (merged.exercises ?? []) as GuestExercise[],
          followings: (merged.followings ?? []) as string[],
          favorites: (merged.favorites ?? []) as string[],
          notifications: (merged.notifications ?? []) as GuestNotification[],
          deleted: merged.deleted ?? base.deleted,
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
        exercises: [],
        followings: [],
        favorites: [],
        notifications: [],
        mirrorOf: null,
        deleted: { reminders: [], medicines: [], plans: [] },

        /** 同步成功后清空墓碑 */
        clearTombstones: () => {
          set({ deleted: { reminders: [], medicines: [], plans: [] } });
          persistNow();
        },

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
          // 先读取该账户既有存档（2026-09-06 修复：老用户每次离线登录都被种子覆盖，
          // 导致删除过的提醒"复活"——改为按 id 并集补齐：本地删除保持删除、用户新增保留）
          const prevKey = archiveKey({ mode: 'seed', userId });
          const prev = prevKey ? loadArchive(prevKey) : {};
          const hasPrev =
            (prev.reminders?.length ?? 0) > 0 ||
            (prev.medicines?.length ?? 0) > 0 ||
            (prev.plans?.length ?? 0) > 0 ||
            (prev.logs?.length ?? 0) > 0;

          persistNow();
          adopt({ mode: 'seed', userId }, false, `seed:${userId}`);
          const patch: Partial<GuestState> = {};

          // 并集工具：以「已有存档 + 种子缺失项」合成（用户删除的 id 不在存档 → 不复活）
          const unionById = <T extends { id: string }>(existing: T[] | undefined, seed: T[] | undefined): T[] => {
            const map = new Map<string, T>();
            for (const item of existing ?? []) map.set(item.id, item);
            for (const item of seed ?? []) if (!map.has(item.id)) map.set(item.id, item);
            return [...map.values()];
          };

          if (hasPrev) {
            patch.reminders = unionById(prev.reminders as { id: string }[] | undefined, d.reminders) as never;
            patch.medicines = unionById(prev.medicines as { id: string }[] | undefined, d.medicines) as never;
            patch.plans = unionById(prev.plans as { id: string }[] | undefined, d.plans) as never;
            patch.logs = unionById(prev.logs as { id: string }[] | undefined, d.logs) as never;
          } else {
            if (d.reminders?.length) patch.reminders = d.reminders;
            if (d.logs?.length) patch.logs = d.logs;
            if (d.medicines?.length) patch.medicines = d.medicines;
            if (d.plans?.length) patch.plans = d.plans;
          }
          if (d.settings) patch.settings = { ...DEFAULT_SETTINGS, ...d.settings };
          patch.feed = d.feed ?? [];
          patch.templates = d.templates ?? [];
          patch.exercises = d.exercises ?? [];
          patch.followings = d.followings ?? [];
          patch.favorites = d.favorites ?? [];
          patch.notifications = d.notifications ?? [];
          set(patch);
          persistNow();
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
          set((s) => ({
            reminders: s.reminders.filter((r) => r.id !== id),
            // 墓碑：镜像模式下删除需在联网同步时通知云端（防 upsert 复活）
            deleted: s.deleted.reminders.includes(id)
              ? s.deleted
              : { ...s.deleted, reminders: [...s.deleted.reminders, id] },
          }));
          persistNow();
        },

        ack: (id, status, at, photoUrl, note) => {
          const target = at ?? new Date(`${todayKey()}T12:00:00`).toISOString();
          // #58（2026-09-09）：同槽幂等合并（与后端 ack 语义一致）——此前无脑追加会产生重复日志，
          // 且对「留言」槽标记完成时状态不会升级，表现为"完成不了"
          const existing = get().logs.find((l) => l.reminderId === id && l.scheduledTime === target);
          const TERMINAL = ['completed', 'challenge_completed', 'skipped'];
          if (existing) {
            set((s) => ({
              logs: s.logs.map((l) => {
                if (l.id !== existing.id) return l;
                const es = String(l.status);
                let next = status;
                if (TERMINAL.includes(es)) next = es as typeof status;
                else if (es === 'photo' && !TERMINAL.includes(status)) next = 'photo' as typeof status;
                return { ...l, status: next, photoUrl: photoUrl ?? l.photoUrl, note: note ?? l.note, createdAt: nowIso() };
              }),
            }));
            persistNow();
            return;
          }
          set((s) => ({
            logs: [
              ...s.logs,
              {
                id: uid('l'),
                reminderId: id,
                scheduledTime: target,
                status,
                amount: 0,
                photoUrl: photoUrl ?? null,
                note: note ?? null,
                createdAt: nowIso(),
              },
            ],
          }));
          persistNow();
        },

        updateLogPhoto: (logId, photoUrl) => {
          set((s) => ({
            logs: s.logs.map((l) => (l.id === logId ? { ...l, photoUrl, createdAt: nowIso() } : l)),
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
          set((s) => ({
            medicines: s.medicines.filter((m) => m.id !== id),
            deleted: s.deleted.medicines.includes(id)
              ? s.deleted
              : { ...s.deleted, medicines: [...s.deleted.medicines, id] },
          }));
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
          set((s) => ({
            plans: s.plans.filter((p) => p.id !== id),
            deleted: s.deleted.plans.includes(id)
              ? s.deleted
              : { ...s.deleted, plans: [...s.deleted.plans, id] },
          }));
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
            exercises: d.exercises ?? s.exercises,
            followings: d.followings ?? s.followings,
            favorites: d.favorites ?? s.favorites,
            notifications: d.notifications ?? s.notifications,
          }));
          persistNow();
        },

        mergeGuestData: () => {
          // 仅账户上下文可合并（游客上下文无意义）
          const s = get();
          if (s.active || s.owner?.mode === 'guest' || !s.owner) {
            throw new Error('请先登录账户，再合并游客数据');
          }
          const raw = localStorage.getItem('cuckoo_local:guest');
          if (!raw) return { merged: 0, skipped: 0 };
          let guest: Record<string, unknown>;
          try {
            guest = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            return { merged: 0, skipped: 0 };
          }
          const at = (x: unknown): number => {
            const v = (x as { updatedAt?: unknown; createdAt?: unknown })?.updatedAt ?? (x as { createdAt?: unknown })?.createdAt;
            return typeof v === 'string' && !Number.isNaN(new Date(v).getTime()) ? new Date(v).getTime() : 0;
          };
          /** 按 id 合并：updatedAt 较新者胜（无时间戳则云端/账户侧保留） */
          const mergeById = <T extends { id: string; [k: string]: unknown }>(
            cur: T[],
            inc: unknown[],
          ): { list: T[]; merged: number; skipped: number } => {
            const map = new Map(cur.map((x) => [x.id, x]));
            let merged = 0;
            let skipped = 0;
            for (const item of inc as T[]) {
              const ex = map.get(item.id);
              if (!ex) {
                map.set(item.id, item);
                merged += 1;
              } else if (at(item) > at(ex)) {
                map.set(item.id, item);
                merged += 1;
              } else {
                skipped += 1;
              }
            }
            return { list: [...map.values()], merged, skipped };
          };
          const cur = get();
          const reminders = mergeById(cur.reminders as never, (guest.reminders as unknown[]) ?? []);
          const medicines = mergeById(cur.medicines as never, (guest.medicines as unknown[]) ?? []);
          const plans = mergeById(cur.plans as never, (guest.plans as unknown[]) ?? []);
          const logsMerge = (() => {
            const seen = new Set(cur.logs.map((l) => l.id));
            const inc = ((guest.logs as unknown[]) ?? []).filter((l) => !seen.has((l as { id: string }).id));
            return { list: [...cur.logs, ...(inc as GuestLog[])], merged: inc.length, skipped: 0 };
          })();
          set({
            reminders: reminders.list as never,
            medicines: medicines.list as never,
            plans: plans.list as never,
            logs: logsMerge.list,
            // 游客期间的删除意图随迁（防止合并后联网同步复活游客已删项）
            deleted: (() => {
              const gDel = (guest.deleted as
                | { reminders?: string[]; medicines?: string[]; plans?: string[] }
                | undefined) ?? { reminders: [], medicines: [], plans: [] };
              const sDel = get().deleted;
              const uni = (a: string[], b: string[] | undefined) =>
                Array.from(new Set([...a, ...(b ?? [])]));
              return {
                reminders: uni(sDel.reminders, gDel.reminders),
                medicines: uni(sDel.medicines, gDel.medicines),
                plans: uni(sDel.plans, gDel.plans),
              };
            })(),
          });
          persistNow();
          try {
            localStorage.removeItem('cuckoo_local:guest');
          } catch {
            /* 忽略 */
          }
          return { merged: reminders.merged + medicines.merged + plans.merged + logsMerge.merged, skipped: reminders.skipped + medicines.skipped + plans.skipped };
        },

        clearGuestData: () => {
          const base = emptyDataset();
          set({
            active: false,
            owner: null,
            mirrorOf: null,
            reminders: base.reminders,
            logs: base.logs,
            medicines: base.medicines,
            plans: base.plans,
            settings: { ...DEFAULT_SETTINGS },
            feed: base.feed,
            templates: base.templates,
            followings: base.followings,
            favorites: base.favorites,
            notifications: base.notifications,
            exercises: base.exercises,
            deleted: base.deleted,
          });
          persistNow();
          try {
            localStorage.removeItem('cuckoo_local:guest');
          } catch {
            /* 忽略 */
          }
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
            countInRate: r.countInRate !== false,
          })),
          logs: get().logs.map((l) => ({
            id: l.id,
            reminderId: l.reminderId,
            scheduledTime: l.scheduledTime,
            actualTime: l.scheduledTime,
            status: l.status,
            amount: l.amount,
            category: 'custom',
            note: l.note ?? null,
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
            photoUrl: m.photoUrls?.length ? m.photoUrls[0] : (m.photoUrl ?? null),
            photoUrls: m.photoUrls?.length ? m.photoUrls : m.photoUrl ? [m.photoUrl] : null,
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
            config: p.config ?? null,
          })),
          settings: { ...get().settings, updatedAt: nowIso() },
          deleted: { ...get().deleted },
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

/** 2026-09-07：在线删除成功后同步本地镜像 + 记墓碑。
 *  否则镜像存档保留已删项，重新登录时 exportBundle 回灌过期镜像 → upsert 让已删项"复活"。 */
export const recordCloudDelete = (kind: 'reminders' | 'medicines' | 'plans', id: string): void => {
  const g = useGuestStore.getState();
  if (kind === 'reminders') g.removeReminder(id);
  else if (kind === 'medicines') g.removeMedicine(id);
  else g.removePlan(id);
};
