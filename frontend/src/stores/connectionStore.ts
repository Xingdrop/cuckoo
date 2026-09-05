/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3N0b3Jlcy9jb25uZWN0aW9uU3RvcmUudHN8MjAyNi0wOXxkN2ZhZGU0Y2Y0 */
import { create } from 'zustand';

/**
 * 联网状态（#17）：navigator.onLine + 服务器健康检查（/api/v1/health）。
 * APK 中相对地址必然失败 → online=false → 全应用进入本地离线模式（顶部显示"未联网"）。
 */
const HEALTH_URL = '/api/v1/health';

function pingHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const ctrl = 'AbortSignal' in window && 'timeout' in AbortSignal ? AbortSignal.timeout(2500) : undefined;
      const timer = setTimeout(() => resolve(false), 3000);
      fetch(HEALTH_URL, { cache: 'no-store', signal: ctrl as AbortSignal | undefined })
        .then((r) => {
          clearTimeout(timer);
          resolve(r.ok);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(false);
        });
    } catch {
      resolve(false);
    }
  });
}

interface ConnectionState {
  online: boolean;
  checking: boolean;
  lastCheck: number;
  init: () => Promise<void>;
  refresh: () => Promise<boolean>;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  online: false,
  checking: false,
  lastCheck: 0,

  init: async () => {
    if (get().checking) return;
    set({ checking: true });
    const ok = navigator.onLine && (await pingHealth());
    set({ online: ok, checking: false, lastCheck: Date.now() });
  },

  refresh: async () => {
    const ok = navigator.onLine && (await pingHealth());
    set({ online: ok, lastCheck: Date.now() });
    return ok;
  },
}));
