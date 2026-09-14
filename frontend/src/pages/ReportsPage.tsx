/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3BhZ2VzL1JlcG9ydHNQYWdlLnRzeHwyMDI2LTA5fDYzZmZhMGZmNmU= */
import { ChevronLeft } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorBanner, EmptyState, LoadingState } from '../components/ui/Feedback';
import { reportsApi } from '../services/api/api.reports';
import type { Report } from '../services/api/api.reports';
import { errorMessage } from '../services/http';

/**
 * 报告列表（FR-704/705）：周报/月报历史；点击进入详情。
 */
export function ReportsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    reportsApi
      .list()
      .then((r) => setItems(r.items))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="mx-auto max-w-md pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-bg px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center text-ink-700"
          aria-label="返回"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="flex-1 text-lg font-semibold">报告</h1>
        <button
          onClick={() => {
            reportsApi
              .generate('weekly')
              .then((r) => navigate(`/reports/${r.id}`))
              .catch((e) => setError(errorMessage(e)));
          }}
          className="rounded-full bg-primary-500 px-4 py-2 text-xs font-medium text-white"
        >
          生成周报
        </button>
      </header>

      <main className="px-4 pt-3">
        <ErrorBanner message={error} />
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState>还没有报告，点击右上角生成周报</EmptyState>
        ) : (
          <ul className="space-y-2">
            {items.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => navigate(`/reports/${r.id}`)}
                  className="flex w-full items-center gap-3 rounded-card bg-surface px-4 py-3.5 text-left shadow-sm"
                >
                  <span className="text-2xl">{r.type === 'weekly' ? '📊' : '🗓️'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {r.type === 'weekly' ? '周报' : '月报'} · {r.period}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      完成率 {r.data.overallRate}% · 坚持 {r.data.streakDays} 天
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
