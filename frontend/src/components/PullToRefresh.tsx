import { ReactNode, useRef, useState } from 'react';

/**
 * #25：下拉刷新（社交等长列表）——在滚动容器顶部下拉出现转圈，松手触发 onRefresh。
 * 组件需要包裹「可滚动容器」本身（其内部 scrollTop 为 0 时下拉才生效）。
 */
export function PullToRefresh({
  onRefresh,
  children,
  className = '',
}: {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  /** 是否处于滚动容器顶部（容器自身滚动 或 window 滚动） */
  const atTop = () => {
    const el = scroller.current;
    if (!el) return window.scrollY <= 1;
    return el.scrollTop <= 1;
  };

  return (
    <div
      ref={scroller}
      className={className}
      style={{ touchAction: 'pan-x pan-down' }}
      onTouchStart={(e) => {
        if (refreshing) return;
        if (atTop()) {
          startY.current = e.touches[0].clientY;
          setPull(0);
        }
      }}
      onTouchMove={(e) => {
        if (startY.current === null || refreshing) return;
        if (!atTop()) {
          setPull(0);
          return;
        }
        const dy = e.touches[0].clientY - startY.current;
        if (dy > 0) setPull(Math.min(90, dy * 0.45));
      }}
      onTouchEnd={() => {
        if (startY.current === null) return;
        startY.current = null;
        if (pull > 55 && !refreshing) {
          setRefreshing(true);
          setPull(48);
          void onRefresh().finally(() => {
            setRefreshing(false);
            setPull(0);
          });
        } else {
          setPull(0);
        }
      }}
    >
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
        style={{ height: refreshing ? 48 : pull }}
      >
        {refreshing ? (
          <span className="flex items-center gap-2 text-xs text-ink-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            刷新中…
          </span>
        ) : pull > 0 ? (
          <span className="text-xs text-ink-400">{pull > 55 ? '松开刷新' : '下拉刷新'}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
