import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestStore } from '../guest/guestStore';

/**
 * 路由守卫（#3 游客支持）：
 * - 已登录 → 放行 children
 * - 游客激活：指定 guestView 的路由展示游客本地视图；其余（账户/社交等）展示 guestBlocked 升级提示
 * - 未登录非游客 → 跳登录页（带回跳）
 */
export function RequireAuth({
  children,
  guestView,
  guestBlocked = <GuestUpgradeHint />,
}: {
  children: ReactNode;
  /** 游客可用页面（今日/提醒/统计 → 本地数据视图） */
  guestView?: ReactNode;
  /** 游客不可用页面（默认：升级提示） */
  guestBlocked?: ReactNode;
}) {
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
  // 游客：主功能页 → guestView；账户/社交页 → 升级提示
  if (!user && guestActive) {
    return <>{guestView ?? guestBlocked}</>;
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
