/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3BhZ2VzL01lZGljaW5lc1BhZ2UudHN4fDIwMjYtMDl8MTkwNTdhZGM0ZA== */
import { CalendarClock, ChevronLeft, ChevronRight, Minus, Plus, Pill } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { ErrorBanner, EmptyState, LoadingState } from '../components/ui/Feedback';
import { absoluteUrl, errorMessage } from '../services/http';
import { medicinesApi } from '../services/api/api.medicines';
import type { Medicine } from '../types';

function stockStatus(m: Medicine): { label: string; cls: string } {
  if (m.stock <= 0) return { label: '已用完', cls: 'bg-danger-500 text-white' };
  if (m.threshold > 0 && m.stock <= m.threshold) return { label: '库存不足', cls: 'bg-accent-500 text-white' };
  return { label: `余 ${m.stock}`, cls: 'bg-primary-50 text-primary-600' };
}

/** 有效期临期判断（未来 30 天内到期 → 临期徽标；FR-309 落地） */
function expiryStatus(m: Medicine): { label: string; cls: string } | null {
  if (!m.expiryDate) return null;
  const days = Math.ceil((new Date(m.expiryDate).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: '已过期', cls: 'bg-danger-500 text-white' };
  if (days <= 30) return { label: `临期 ${days} 天`, cls: 'bg-warning-500 text-white' };
  return null;
}

/**
 * P-07 药品列表（FR-301）
 * 库存/阈值/快捷补货与手动记录/服药历史入口
 */
export function MedicinesPage() {
  const [items, setItems] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      setItems(await medicinesApi.list());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const quickAdd = async (m: Medicine) => {
    try {
      await medicinesApi.adjustStock(m.id, 10);
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const quickTake = async (m: Medicine) => {
    try {
      await medicinesApi.deduct(m.id, m.deductionPerUse);
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="mx-auto max-w-md pb-20">
      <header className="flex items-center gap-2 px-4 pt-5">
        <button
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center text-ink-700"
          aria-label="返回"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">药品</h1>
          <p className="text-xs text-ink-500">管理用药与库存</p>
        </div>
        <button
          onClick={() => navigate('/medicines/new')}
          className="flex h-11 items-center gap-1 rounded-full bg-primary-500 px-4 text-sm font-medium text-white"
        >
          <Plus size={16} /> 添加药品
        </button>
      </header>

      <main className="px-4 pt-4">
        <ErrorBanner message={error} />
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState icon={<Pill size={36} strokeWidth={1.2} />}>
            还没有药品
            <button
              onClick={() => navigate('/medicines/new')}
              className="mt-3 block w-full rounded-btn bg-primary-500 py-3 text-sm font-medium text-white"
            >
              添加第一种药
            </button>
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {items.map((m) => {
              const st = stockStatus(m);
              const ex = expiryStatus(m);
              return (
                <li key={m.id} className="rounded-card bg-surface p-4 shadow-sm">
                  <button
                    onClick={() => navigate(`/medicines/${m.id}/logs`)}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-50 text-lg">
                      💊
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.name}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {m.dosage ?? ''}
                        {m.administration ? ` · ${m.administration}` : ''}
                        {m.instructions ? ` · ${m.instructions}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${st.cls}`}>
                      {st.label}
                    </span>
                    {ex && (
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${ex.cls}`}>
                        {ex.label}
                      </span>
                    )}
                    <ChevronRight size={16} className="shrink-0 text-ink-300" />
                  </button>
                  {(m.photoUrls?.length ?? 0) > 0 && (
                    <div className="mt-2.5 flex gap-1.5 overflow-x-auto">
                      {m.photoUrls!.slice(0, 6).map((u, i) => (
                        <img
                          key={u}
                          src={absoluteUrl(u)}
                          alt={`${m.name} 照片 ${i + 1}`}
                          className="h-14 w-14 shrink-0 rounded-md object-cover"
                        />
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-2.5">
                    <button
                      onClick={() => quickTake(m)}
                      className="flex h-9 flex-1 items-center justify-center gap-1 rounded-md bg-primary-50 text-xs text-primary-600"
                    >
                      <Minus size={13} /> 服用一次
                    </button>
                    <button
                      onClick={() => quickAdd(m)}
                      className="flex h-9 flex-1 items-center justify-center gap-1 rounded-md bg-ink-100/60 text-xs text-ink-700"
                    >
                      <Plus size={13} /> 补充库存
                    </button>
                    <button
                      onClick={() => navigate(`/medicines/${m.id}/edit`)}
                      className="flex h-9 items-center justify-center gap-1 rounded-md px-3 text-xs text-ink-500"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => navigate(`/medicines/${m.id}/logs`)}
                      className="flex h-9 items-center justify-center gap-1 rounded-md px-3 text-xs text-ink-500"
                    >
                      <CalendarClock size={13} /> 历史
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
