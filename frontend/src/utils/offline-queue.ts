/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3V0aWxzL29mZmxpbmUtcXVldWUudHN8MjAyNi0wOXw4ZTdjNDk4NDAz */
/**
 * 离线同步队列（技术方案 §2.2「本地优先 + 云同步」的承诺落地项）。
 * 提醒执行操作（ack/delay）失败时入队，网络恢复/页面重载后重放。
 * 与后端幂等（UNIQUE(reminderId, scheduledTime)）配合，重复重放无副作用。
 */

export interface PendingOp {
  id: string;
  type: 'ack' | 'delay';
  reminderId: string;
  /** ack：scheduledTime（幂等键）；delay：原计划时间 */
  scheduledTime: string;
  /** ack 状态（completed/skipped/challenge_completed/photo/missed） */
  status?: 'completed' | 'skipped' | 'challenge_completed' | 'photo' | 'missed';
  /** delay 分钟数 */
  minutes?: number;
  photoUrl?: string;
  /** 2026-09-06：可选文字记录（随手记，≤500 字） */
  note?: string;
  createdAt: number;
}

/** 队列存储抽象（默认 IndexedDB；单测注入内存实现） */
export interface OpStore {
  getAll(): Promise<PendingOp[]>;
  put(op: PendingOp): Promise<void>;
  delete(id: string): Promise<void>;
}

const DB_NAME = 'cuckoo-offline';
const STORE_NAME = 'ops';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const idbStore: OpStore = {
  async getAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as PendingOp[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  },
  async put(op) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(op);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async delete(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};

let store: OpStore = idbStore;

/** 测试专用：注入内存存储（传 null 恢复默认 IndexedDB） */
export function _setOpStoreForTest(s: OpStore | null): void {
  store = s ?? idbStore;
}

export function isOfflineQueueSupported(): boolean {
  // 测试注入内存存储时视为可用（jsdom 无 indexedDB）
  return typeof indexedDB !== 'undefined' || store !== idbStore;
}

/** 入队一条待同步操作（失败时返回 false，调用方保持原行为） */
export async function enqueueOp(op: Omit<PendingOp, 'id' | 'createdAt'>): Promise<boolean> {
  if (!isOfflineQueueSupported()) return false;
  try {
    await store.put({ ...op, id: crypto.randomUUID(), createdAt: Date.now() });
    return true;
  } catch {
    return false;
  }
}

export async function listOps(): Promise<PendingOp[]> {
  if (!isOfflineQueueSupported()) return [];
  const ops = await store.getAll();
  return ops.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeOp(id: string): Promise<void> {
  try {
    await store.delete(id);
  } catch {
    /* 忽略：重放成功后清理失败仅影响下次重放（幂等保证无害） */
  }
}

export interface ReplayResult {
  success: number;
  failed: number;
}

/**
 * 重放队列：按序执行 executor，成功即移除；失败保留待下次。
 * executor 抛错即视为该条失败（不中断后续条目）。
 */
export async function replayOps(
  executor: (op: PendingOp) => Promise<void>,
): Promise<ReplayResult> {
  const ops = await listOps();
  let success = 0;
  let failed = 0;
  for (const op of ops) {
    try {
      await executor(op);
      await removeOp(op.id);
      success += 1;
    } catch {
      failed += 1;
    }
  }
  return { success, failed };
}
