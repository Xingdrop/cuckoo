import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestStore } from '../guest/guestStore';

/**
 * 路由守卫（#1 游客复用原界面；#14 边界）：
 * - 已登录 → 放行（原界面）
 * - 游客：主功能放行（API 层自动切本地适配）；
 *   社交（/social /posts）→ 显示"请登录后使用"；账户/数据页 → 升级提示
 * - 未登录非游客 → 跳登录页（带回跳）
 */
const GUEST_SOCIAL_PREFIXES = ['/social', '/posts'];
const GUEST_LOCK_PREFIXES = [
  '/profile',
  '/settings',
  '/notifications',
  '/reports',
  '/achievements',
  '/medicines',
  '/devices',
  '/water-settings',
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
  if (!user && guestActive) {
    if (GUEST_SOCIAL_PREFIXES.some((p) => location.pathname.startsWith(p))) {
      return <GuestHint variant="social" />;
    }
    if (GUEST_LOCK_PREFIXES.some((p) => location.pathname.startsWith(p))) {
      return <GuestHint variant="lock" />;
    }
  }
  return <>{children}</>;
}

/** 游客提示页（社交 = 请登录后使用；其它 = 升级提示） */
export function GuestHint({ variant }: { variant: 'social' | 'lock' }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-8 text-center">
      <span className="text-4xl">{variant === 'social' ? '👥' : '🔒'}</span>
      <h2 className="mt-3 text-lg font-semibold">
        {variant === 'social' ? '请登录后使用社交功能' : '该功能需要登录'}
      </h2>
      <p className="mt-2 text-sm text-ink-500">
        {variant === 'social'
          ? '社区帖子的发布、互动、加入计划等需要账号；游客数据保存在本机，注册后自动同步合并。'
          : '游客模式已开放今日 / 提醒 / 统计；更多功能请注册或登录（本机数据将自动同步合并）。'}
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
