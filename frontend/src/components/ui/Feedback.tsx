import type { ReactNode } from 'react';

/** 页面级错误横幅（统一错误展示样式） */
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mb-3 rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{message}</p>
  );
}

/** 页面级加载态 */
export function LoadingState() {
  return <div className="py-16 text-center text-sm text-ink-500">加载中…</div>;
}

/** 页面级空态（icon 传入 lucide 图标组件元素） */
export function EmptyState({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-card bg-surface p-10 text-center text-sm text-ink-500 shadow-sm">
      {icon && <div className="mx-auto mb-3 flex justify-center text-ink-300">{icon}</div>}
      {children}
    </div>
  );
}
