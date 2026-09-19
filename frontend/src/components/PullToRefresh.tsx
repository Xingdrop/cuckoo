/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL2NvbXBvbmVudHMvUHVsbFRvUmVmcmVzaC50c3h8MjAyNi0wOXw4NDI1MWQ1NjE5 */
import { XCircle } from 'lucide-react';
import { ReactNode, useRef, useState } from 'react';

/** 失败提示停留时长（毫秒） */
const FAIL_MS = 600;

/**
 * #25：下拉刷新（社交等长列表）——平滑位移 + 转圈；断网/失败显示「刷新失败」。
 * - 与正常上下滚动兼容（touch-action: pan-y，只有顶部下拉时才接管）
 * - onRefresh 返回 boolean：false → 在松开处显示「刷新失败」，0.6 秒后自动收起（离线模式即走此路径）
 */
export function PullToRefresh({
  onRefresh,
  children,
  className = '',
}: {
  onRefresh: () => Promise<boolean>;
  children: ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const failTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      style={{ touchAction: 'pan-y' }}
      onTouchStart={(e) => {
        if (refreshing) return;
        if (atTop()) startY.current = e.touches[0].clientY;
      }}
      onTouchMove={(e) => {
        if (startY.current === null || refreshing) return;
        if (!atTop()) {
          setPull(0);
          return;
        }
        const dy = e.touches[0].clientY - startY.current;
        // 仅向下拉有效；无弹簧位移，直接用位移比率（平滑跟随手指）
        if (dy > 0) setPull(Math.min(80, dy * 0.4));
      }}
      onTouchEnd={() => {
        if (startY.current === null) return;
        startY.current = null;
        if (pull >= 52 && !refreshing) {
          setRefreshing(true);
          setPull(44);
          void onRefresh()
            .then((ok) => {
              if (!ok) {
                setFailed(true);
                if (failTimer.current) clearTimeout(failTimer.current);
                failTimer.current = setTimeout(() => setFailed(false), FAIL_MS);
              }
            })
            .catch(() => {
              setFailed(true);
              if (failTimer.current) clearTimeout(failTimer.current);
              failTimer.current = setTimeout(() => setFailed(false), FAIL_MS);
            })
            .finally(() => {
              setRefreshing(false);
              setPull(0);
            });
        } else {
          setPull(0);
        }
      }}
    >
      {/* 指示区：位移式（跟随手指，释放后平滑回落） */}
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{
          // 刷新中 / 失败时固定撑开指示区：否则 pull 已归零 → 高度为 0，提示会被 overflow 裁掉看不见
          height: Math.round(refreshing || failed ? Math.max(pull, 44) : pull),
          transition: refreshing || failed || pull === 0 ? 'height 220ms ease' : 'none',
        }}
      >
        {refreshing ? (
          <span className="flex items-center gap-1.5 text-xs text-ink-500">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            刷新中…
          </span>
        ) : failed ? (
          <span className="flex items-center gap-1.5 text-xs text-danger-600">
            <XCircle className="h-4 w-4 shrink-0" strokeWidth={2.2} />
            刷新失败
          </span>
        ) : pull > 0 ? (
          <span className={`text-xs ${pull >= 52 ? 'text-primary-600' : 'text-ink-400'}`}>
            {pull >= 52 ? '松开刷新' : '下拉刷新'}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
