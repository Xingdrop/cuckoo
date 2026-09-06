/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8c3JjL3N0b3Jlcy9jb25uZWN0aW9uU3RvcmUudHN8MjAyNi0wOXwwZjFiYjUzNThk */
import { create } from 'zustand';
import { apiBase } from '../services/http';

/**
 * 联网状态（#17）：navigator.onLine + 服务器健康检查（/api/v1/health）。
 * APK 中相对地址必然失败 → online=false → 全应用进入本地离线模式（顶部显示"未联网"）。
 */


function pingHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const ctrl = 'AbortSignal' in window && 'timeout' in AbortSignal ? AbortSignal.timeout(2500) : undefined;
      const timer = setTimeout(() => resolve(false), 3000);
      // 跟随 apiBase（APK 未配地址时打本地源必然离线——配置后即可在线）
      fetch(`${apiBase()}/health`, { cache: 'no-store', signal: ctrl as AbortSignal | undefined })
        .then(async (r) => {
          clearTimeout(timer);
          if (!r.ok) {
            resolve(false);
            return;
          }
          // 防假在线（2026-09-06）：APK 未配服务器地址时 WebView 会用 200 的 index.html
          // 兜底任何路径——校验响应体确为健康 JSON 才算在线
          try {
            const j = (await r.json()) as { status?: string };
            resolve(j?.status === 'ok');
          } catch {
            resolve(false);
          }
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
