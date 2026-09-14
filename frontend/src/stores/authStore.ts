/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3N0b3Jlcy9hdXRoU3RvcmUudHN8MjAyNi0wOXxmMzM4MzE5Yzk4 */ */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';
import { tokenStore } from '../services/http';
import { authApi } from '../services/api/api.auth';
import { useGuestStore } from '../guest/guestStore';
import { refreshLocalCache } from '../guest/mirror';
import { useConnectionStore } from './connectionStore';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  /** 已初始化（是否尝试过恢复会话） */
  initialized: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, healthGoals?: string[]) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  init: () => Promise<void>;
}

/** 网络类错误（无响应）：服务器不可达/断网/超时 */
const isNetworkError = (e: unknown): boolean =>
  axios.isAxiosError(e) && !e.response;

/**
 * 认证状态（#17）：
 * - 在线：服务器校验（登录/注册），成功后镜像全量数据到本地（断网可用）
 * - 离线：本地密码校验（APK 预置种子账户）→ "已登录但未联网"状态（token 为空）
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      /** 离线登录：种子账户本地校验（bcrypt），成功后导入本地数据集 */
      const offlineLogin = async (username: string, password: string): Promise<void> => {
        const { verifyOfflineLogin, seedIssue } = await import('../guest/seed');
        const r = await verifyOfflineLogin(username, password);
        if (!r) {
          // #24：区分「密码错误」与「离线种子缺失/损坏」——手机无法登录时给出明确指引
          const issue = await seedIssue();
          throw new Error(issue ?? '用户名或密码错误');
        }
        tokenStore.clear();
        set({ user: r.user });
        const g = useGuestStore.getState();
        g.deactivate();
        g.seedDataset(r.dataset, r.user.id);
        localStorage.setItem(
          'cuckoo_offline_session',
          JSON.stringify({ user: r.user, at: Date.now() }),
        );
      };

      return {
        user: null,
        initialized: false,

        init: async () => {
          // 无 token：恢复「离线登录」会话（含种子账户）——以本地镜像存在 + 缓存资料为凭
          if (!tokenStore.get()) {
            try {
              const raw = localStorage.getItem('cuckoo_offline_session');
              const current = get().user;
              const g = useGuestStore.getState();
              if (raw && current && g.mirrorOf !== null) {
                const cached = JSON.parse(raw) as { user: User };
                if (cached.user && cached.user.id === current.id) {
                  set({ initialized: true });
                  return;
                }
              }
            } catch {
              /* 缓存损坏忽略 */
            }
            // 会话失效（token 已清但 persist 仍残留 user）→ 同步清 user，避免死循环
            if (get().user) set({ user: null });
            set({ initialized: true });
            return;
          }
          try {
            const user = await authApi.getMe();
            set({ user, initialized: true });
          } catch (e) {
            if (isNetworkError(e)) {
              // 断网：保留 token，用本地缓存资料继续（数据走本地镜像）
              try {
                const raw = localStorage.getItem('cuckoo_offline_session');
                const cached = raw ? (JSON.parse(raw) as { user: User }) : null;
                set({ user: cached?.user ?? get().user, initialized: true });
                return;
              } catch {
                /* 忽略 */
              }
            }
            tokenStore.clear();
            set({ user: null, initialized: true });
          }
        },

        login: async (username, password) => {
          // online 初始为 false、由 init() 异步探测——先等探测出结果再决策，
          // 否则冷启动快速点击会被误判离线走进种子兜底（对在线新用户报"用户名或密码错误"）
          if (!(await useConnectionStore.getState().ensureChecked())) {
            await offlineLogin(username, password);
            return;
          }
          try {
            const res = await authApi.login({ username, password });
            if (!res?.token || !res?.user?.id) {
              throw new Error('服务器响应异常：请检查「设置 → 高级 → 服务器地址」是否填写正确，并确认后端已启动');
            }
            tokenStore.set(res.token);
            set({ user: res.user });
            // #15：登录即退出游客模式（避免界面/数据停留在游客态）
            const g = useGuestStore.getState();
            g.deactivate();
            g.loginAccount(res.user.id, 'online');
            localStorage.setItem(
              'cuckoo_offline_session',
              JSON.stringify({ user: res.user, at: Date.now() }),
            );
            // 离线数据保护：该账户若有本地镜像改动，先回灌云端（按更新时间较新合并）再拉取，
            // 避免 refreshLocalCache 直接用服务端数据覆盖丢失（2026-09-06 事故根因）
            const { syncMirrorToCloud } = await import('../guest/mirror');
            const synced = await syncMirrorToCloud().catch(() => false);
            if (!synced) void refreshLocalCache();
          } catch (e) {
            // 服务器可达但密码错误等 → 原样抛给页面
            if (!isNetworkError(e)) throw e;
            // 网络中断 → 回退本地离线校验
            await offlineLogin(username, password);
          }
        },

        register: async (username, password, healthGoals) => {
          const res = await authApi.register({ username, password, healthGoals });
          // 防御：响应缺 token/user（服务器地址错误/版本过旧）时给出可操作提示而非崩溃
          if (!res?.token || !res?.user?.id) {
            throw new Error('服务器响应异常：请检查「设置 → 高级 → 服务器地址」是否填写正确，并确认后端已启动');
          }
          tokenStore.set(res.token);
          set({ user: res.user });
          const g = useGuestStore.getState();
          g.deactivate();
          g.loginAccount(res.user.id, 'online');
          localStorage.setItem(
            'cuckoo_offline_session',
            JSON.stringify({ user: res.user, at: Date.now() }),
          );
          void refreshLocalCache();
        },

        logout: () => {
          tokenStore.clear();
          // 安全（2026-09-14）：清掉 SW 缓存的带鉴权 /api 响应，避免共享设备上后一位用户
          // 离线时命中前一位用户的缓存数据（本地镜像数据集按既有设计保留，供本人离线复用）
          if (typeof caches !== 'undefined') {
            void caches.delete('cuckoo-api').catch(() => undefined);
          }
          set({ user: null });
          localStorage.removeItem('cuckoo_offline_session');
          // 保留本地数据集（下次离线登录可恢复）；退出游客态
          useGuestStore.getState().deactivate();
        },

        setUser: (user) => set({ user }),
      };
    },
    {
      name: 'cuckoo_auth',
      partialize: (s) => ({ user: s.user }),
    },
  ),
);
