import { Bell, ChevronLeft } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorBanner, EmptyState, LoadingState } from '../components/ui/Feedback';
import { errorMessage } from '../services/http';
import { notificationsApi, NotificationItem } from '../services/api/api.social';

const TYPE_ICON: Record<string, string> = {
  low_stock: '💊',
  missed: '⏰',
  weekly_report: '📊',
  monthly_report: '📊',
  achievement: '🏅',
  reminder: '🔔',
  system: '📢',
};

function fmt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * P-17 通知中心（FR-801）
 */
export function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await notificationsApi.list();
      // #26：通知中心（社交右上角铃铛）不通报「每日提醒」类通知（missed 超时提醒等）
      setItems(r.items.filter((n) => n.type !== 'missed'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markAll = async () => {
    await notificationsApi.markRead();
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  return (
    <div className="mx-auto max-w-md pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-bg/95 px-4 py-3 backdrop-blur">
        <button
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center text-ink-700"
          aria-label="返回"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="flex-1 text-lg font-semibold">通知</h1>
        <button onClick={markAll} className="text-xs text-primary-600">
          全部已读
        </button>
      </header>

      <main className="px-4 pt-3">
        <ErrorBanner message={error} />
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState icon={<Bell size={36} strokeWidth={1.2} />}>暂无通知</EmptyState>
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <li
                key={n.id}
                onClick={() => {
                  void notificationsApi.markRead(n.id);
                  setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
                  if (n.linkUrl) navigate(n.linkUrl);
                }}
                className={`flex items-start gap-3 rounded-card bg-surface px-4 py-3.5 shadow-sm ${
                  n.isRead ? 'opacity-60' : ''
                }`}
              >
                <span className="mt-0.5 text-xl">{TYPE_ICON[n.type] ?? '🔔'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{n.content}</p>
                  <p className="mt-1 text-[10px] text-ink-300">{fmt(n.createdAt)}</p>
                </div>
                {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" />}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
