import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuestStore } from '../guest/guestStore';

/** #17：seed 离线账户（APK 预置，已登录未联网）——本地数据全开，社交走缓存 */
const isSeedMode = () => (useGuestStore.getState().mirrorOf ?? '').startsWith('seed:');

/**
 * 路由守卫（#1 游客复用原界面；#14/#17 边界）：
 * - 已登录（在线）→ 放行
 * - 离线账户（seed 镜像，已登录未联网）→ 放行全部本地功能，社交展示缓存内容
 * - 游客：本地功能全部开放（今日/提醒/统计/服务与管理/我的计划）；
 *   社交（/social /posts /notifications）→ "请登录后使用社交功能"；账户数据页 → 升级提示
 * - 未登录非游客 → 跳登录页
 */
const GUEST_SOCIAL_PREFIXES = ['/social', '/posts', '/notifications'];
const ACCOUNT_PREFIXES = ['/profile', '/settings', '/reports', '/achievements', '/devices'];

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, initialized } = useAuthStore();
  const guestActive = useGuestStore((s) => s.active);
  const seedMode = isSeedMode();
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
  const local = guestActive || seedMode;
  if (local) {
    // 游客：社交与通知锁定；离线账户（已登录）：社交开放（缓存只读）
    if (guestActive && GUEST_SOCIAL_PREFIXES.some((p) => location.pathname.startsWith(p))) {
      return <GuestHint variant="social" />;
    }
    // 账户/云端数据页：游客与离线账户均提示
    if (ACCOUNT_PREFIXES.some((p) => location.pathname.startsWith(p))) {
      return <GuestHint variant={seedMode ? 'offline' : 'lock'} />;
    }
    return <>{children}</>;
  }
  return <>{children}</>;
}

/** 提示页：social=游客禁社交；lock=需登录；offline=离线账户的云端功能需联网 */
export function GuestHint({ variant }: { variant: 'social' | 'lock' | 'offline' }) {
  const navigate = useNavigate();
  const guest = useGuestStore((s) => s.active);
  const goLogin = () => navigate('/login');
  const goGuest = () => navigate('/guest');
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-8 text-center">
      <span className="text-4xl">{variant === 'social' ? '👥' : variant === 'offline' ? '📡' : '🔒'}</span>
      <h2 className="mt-3 text-lg font-semibold">
        {variant === 'social'
          ? '请登录后使用社交功能'
          : variant === 'offline'
            ? '该功能需要联网'
            : '该功能需要登录'}
      </h2>
      <p className="mt-2 text-sm text-ink-500">
        {variant === 'social'
          ? '游客模式仅开放本地功能（今日/提醒/统计/服务与管理和我的计划）；注册登录后即可发布、互动、加入计划。'
          : variant === 'offline'
            ? '当前为离线账户（数据存本机，断网前接收的社交内容可浏览）。连接服务器并登录后即可使用账户与云端功能。'
            : '游客模式已开放本地功能（今日/提醒/统计/服务与管理和我的计划）；账户、社交与云端数据请登录。'}
      </p>
      <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
        <button
          onClick={goLogin}
          className="rounded-btn bg-primary-500 px-6 py-3 text-sm font-medium text-white"
        >
          {variant === 'offline' ? '联网并登录' : '去登录 / 注册'}
        </button>
        {guest && (
          <button
            onClick={goGuest}
            className="rounded-btn bg-ink-100 px-6 py-3 text-sm font-medium text-ink-700"
          >
            返回游客模式
          </button>
        )}
      </div>
    </div>
  );
}
