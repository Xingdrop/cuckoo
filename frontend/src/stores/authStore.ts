import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { tokenStore } from '../services/http';
import { authApi } from '../services/api/api.auth';
import { useGuestStore } from '../guest/guestStore';
import { cacheMirrorData } from '../guest/mirror';
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

/**
 * 认证状态：token 存 localStorage（http 拦截器读取），用户信息持久化。
 * 页面刷新后 init() 恢复会话；401 时 http 拦截器自动清 token 并跳登录。
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      initialized: false,

      init: async () => {
        if (!tokenStore.get()) {
          // #15：离线会话——无 token 且断网 + 本地缓存的账号资料 → 允许离线登录（镜像模式）
          try {
            const raw = localStorage.getItem('cuckoo_offline_session');
            if (!navigator.onLine && raw && useGuestStore.getState().mirrorOf) {
              const cached = JSON.parse(raw) as { user: User };
              if (cached.user) {
                set({ user: cached.user, initialized: true });
                return;
              }
            }
          } catch {
            /* 忽略缓存损坏 */
          }
          // 会话失效（token 已清但 persist 仍残留 user）→ 同步清 user，避免 LoginPage↔/today 死循环
          if (get().user) set({ user: null });
          set({ initialized: true });
          return;
        }
        try {
          const user = await authApi.getMe();
          set({ user, initialized: true });
        } catch {
          tokenStore.clear();
          set({ user: null, initialized: true });
        }
      },

      login: async (username, password) => {
        const res = await authApi.login({ username, password });
        tokenStore.set(res.token);
        set({ user: res.user });
        // #15：本地缓存账号（离线登录用）
        localStorage.setItem('cuckoo_offline_session', JSON.stringify({ user: res.user, at: Date.now() }));
        void cacheMirrorData();
      },

      register: async (username, password, healthGoals) => {
        const res = await authApi.register({ username, password, healthGoals });
        tokenStore.set(res.token);
        set({ user: res.user });
        localStorage.setItem('cuckoo_offline_session', JSON.stringify({ user: res.user, at: Date.now() }));
        void cacheMirrorData();
      },

      logout: () => {
        tokenStore.clear();
        set({ user: null });
        localStorage.removeItem('cuckoo_offline_session');
      },

      setUser: (user) => set({ user }),
    }),
    {
      name: 'cuckoo_auth',
      partialize: (s) => ({ user: s.user }),
    },
  ),
);
