/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL2NvbXBvbmVudHMvdWkvRmVlZGJhY2sudHN4fDIwMjYtMDl8YjAyMzE5ZDgxNw== */
import type { ReactNode } from 'react';
import { BirdMascot } from '../BirdMascot';

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

/** 页面级空态（默认带布谷鸟吉祥物；icon 可覆盖为 lucide 图标元素） */
export function EmptyState({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-card bg-surface p-10 text-center text-sm text-ink-500 shadow-sm">
      <div className="mx-auto mb-3 flex justify-center">
        {icon ?? <BirdMascot size={84} className="opacity-90" />}
      </div>
      {children}
    </div>
  );
}
