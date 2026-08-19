import { CalendarClock, ChevronRight, Minus, Plus, Pill } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { errorMessage } from '../services/http';
import { medicinesApi } from '../services/api/api.medicines';
import type { Medicine } from '../types';

function stockStatus(m: Medicine): { label: string; cls: string } {
  if (m.stock <= 0) return { label: '已用完', cls: 'bg-danger-500 text-white' };
  if (m.threshold > 0 && m.stock <= m.threshold) return { label: '库存不足', cls: 'bg-accent-500 text-white' };
  return { label: `余 ${m.stock}`, cls: 'bg-primary-50 text-primary-600' };
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
      <header className="flex items-center justify-between px-4 pt-6">
        <div>
          <h1 className="text-xl font-semibold">药品</h1>
          <p className="mt-1 text-sm text-ink-500">管理用药与库存</p>
        </div>
        <button
          onClick={() => navigate('/medicines/new')}
          className="flex h-11 items-center gap-1 rounded-full bg-primary-500 px-4 text-sm font-medium text-white"
        >
          <Plus size={16} /> 添加药品
        </button>
      </header>

      <main className="px-4 pt-4">
        {error && (
          <p className="mb-3 rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{error}</p>
        )}
        {loading ? (
          <div className="py-16 text-center text-sm text-ink-500">加载中…</div>
        ) : items.length === 0 ? (
          <div className="rounded-card bg-surface p-10 text-center text-sm text-ink-500 shadow-sm">
            <Pill size={36} className="mx-auto mb-3 text-ink-300" strokeWidth={1.2} />
            还没有药品
            <button
              onClick={() => navigate('/medicines/new')}
              className="mt-3 block w-full rounded-btn bg-primary-500 py-3 text-sm font-medium text-white"
            >
              添加第一种药
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((m) => {
              const st = stockStatus(m);
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
                    <ChevronRight size={16} className="shrink-0 text-ink-300" />
                  </button>
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
