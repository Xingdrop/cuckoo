/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3N0b3Jlcy9hdXRoU3RvcmUudHN8MjAyNi0wOXxmMzM4MzE5Yzk4 */
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
          const conn = useConnectionStore.getState();
          if (!conn.online) {
            await offlineLogin(username, password);
            return;
          }
          try {
            const res = await authApi.login({ username, password });
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
            void refreshLocalCache();
          } catch (e) {
            // 服务器可达但密码错误等 → 原样抛给页面
            if (!isNetworkError(e)) throw e;
            // 网络中断 → 回退本地离线校验
            await offlineLogin(username, password);
          }
        },

        register: async (username, password, healthGoals) => {
          const res = await authApi.register({ username, password, healthGoals });
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
