/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3BhZ2VzL01lZGljaW5lTG9nc1BhZ2UudHN4fDIwMjYtMDl8MGU5OGJlYjU4OQ== */
import { ChevronLeft } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../services/http';
import { medicinesApi } from '../services/api/api.medicines';
import type { ReminderLog } from '../types';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  completed: { label: '已完成', cls: 'bg-primary-50 text-primary-600' },
  challenge_completed: { label: '拍照完成', cls: 'bg-primary-50 text-primary-600' },
  manual: { label: '手动记录', cls: 'bg-primary-50 text-primary-600' },
  delayed: { label: '延迟完成', cls: 'bg-accent-100 text-accent-700' },
  skipped: { label: '已跳过', cls: 'bg-ink-100 text-ink-500' },
  missed: { label: '漏服', cls: 'bg-danger-500/10 text-danger-700' },
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * P-08 服药历史（FR-308）
 */
export function MedicineLogsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState<ReminderLog[]>([]);
  const [total, setTotal] = useState(0);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // AC-306：按日/周/月查看——客户端时间范围过滤（周 = 近 7 天，月 = 近 30 天）
  const [range, setRange] = useState<'week' | 'month' | 'all'>('all');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await medicinesApi.logs(id);
      setItems(r.items);
      setTotal(r.total);
      if (!name) {
        const meds = await medicinesApi.list();
        setName(meds.find((m) => m.id === id)?.name ?? '');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, name]);

  useEffect(() => {
    void load();
  }, [load]);

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
        <div>
          <h1 className="text-lg font-semibold">服药历史</h1>
          <p className="text-xs text-ink-500">{name || '药品'} · 共 {total} 条</p>
        </div>
      </header>

      <main className="px-4 pt-3">
        {error && (
          <p className="mb-3 rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{error}</p>
        )}
        {items.length > 0 && (
          <div className="mb-3 flex gap-1.5">
            {([
              ['week', '近一周'],
              ['month', '近一月'],
              ['all', '全部'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setRange(key)}
                className={`rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                  range === key ? 'bg-primary-500 font-medium text-white' : 'bg-surface text-ink-600 shadow-sm'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {loading ? (
          <div className="py-16 text-center text-sm text-ink-500">加载中…</div>
        ) : items.length === 0 ? (
          <div className="rounded-card bg-surface p-10 text-center text-sm text-ink-500 shadow-sm">
            暂无服药记录
          </div>
        ) : (
          <ul className="space-y-2">
            {items
              .filter((l) => {
                if (range === 'all') return true;
                const ms = Date.now() - new Date(l.scheduledTime).getTime();
                return ms <= (range === 'week' ? 7 : 30) * 86_400_000;
              })
              .map((l) => {
              const meta = STATUS_META[l.status] ?? { label: l.status, cls: 'bg-ink-100 text-ink-500' };
              return (
                <li key={l.id} className="flex items-center gap-3 rounded-card bg-surface px-4 py-3 shadow-sm">
                  <span className="text-lg">💊</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{l.medicineNameSnapshot ?? name}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{fmt(l.scheduledTime)}</p>
                  </div>
                  {l.delayMinutes > 0 && (
                    <span className="text-xs text-ink-500">延迟 {l.delayMinutes} 分</span>
                  )}
                  {l.stockDeducted > 0 && (
                    <span className="text-xs text-ink-500">-{l.stockDeducted}</span>
                  )}
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}>
                    {meta.label}
                  </span>
                </li>
              );
              })}
          </ul>
        )}
      </main>
    </div>
  );
}
