import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestStore } from '../guest/guestStore';

/**
 * 路由守卫（#1 游客复用原界面）：
 * - 已登录 → 放行（原界面）
 * - 游客：今日/提醒/统计等主功能放行（API 层自动切本地适配）；
 *   账户+社交路由（路径黑名单）→ 升级提示页
 * - 未登录非游客 → 跳登录页（带回跳）
 */
const GUEST_LOCK_PREFIXES = [
  '/social',
  '/plans',
  '/posts',
  '/medicines',
  '/exercises',
  '/pomodoro',
  '/water-settings',
  '/notifications',
  '/reports',
  '/achievements',
  '/settings',
  '/profile',
  '/users',
  '/devices',
  '/privacy',
];

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, initialized } = useAuthStore();
  const guestActive = useGuestStore((s) => s.active);
  const location = useLocation();

  if (!initialized) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-ink-300">
        加载中…
      </div>
    );
  }
  if (!user && !guestActive) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  if (!user && guestActive && GUEST_LOCK_PREFIXES.some((p) => location.pathname.startsWith(p))) {
    return <GuestUpgradeHint />;
  }
  return <>{children}</>;
}

/** 游客锁定页（账户/社交等）：提示注册升级 */
export function GuestUpgradeHint() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-8 text-center">
      <span className="text-4xl">🔒</span>
      <h2 className="mt-3 text-lg font-semibold">该功能需要登录</h2>
      <p className="mt-2 text-sm text-ink-500">
        游客模式已开放今日 / 提醒 / 统计；账户、社交与更多功能请注册或登录（本机数据将自动同步合并）。
      </p>
      <button
        onClick={() => {
          window.location.href = '/guest';
        }}
        className="mt-5 rounded-btn bg-primary-500 px-6 py-3 text-sm font-medium text-white"
      >
        注册 / 登录并同步
      </button>
    </div>
  );
}
