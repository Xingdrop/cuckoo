import { Plus, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { useAuthStore } from '../stores/authStore';
import { remindersApi } from '../services/api/api.reminders';
import type { Reminder } from '../types';

const CATEGORY_EMOJI: Record<string, string> = {
  medication: '💊',
  exercise: '🏃',
  water: '💧',
  rest: '😴',
  work: '💼',
  custom: '📌',
};

interface TodayReminder extends Reminder {
  due: string; // 今日触发时间 HH:mm
  done: boolean; // 今日是否已完成
}

/**
 * P-03 今日看板（FR-701 基础版）
 * 今日提醒时间轴 + 简单完成统计（完成率/连续天数在 M3 统计模块接入）
 */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [items, setItems] = useState<TodayReminder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const list = await remindersApi.list({ isActive: true });
      const now = new Date();
      const today = list
        .map((r) => {
          const next = r.nextTriggerAt ? new Date(r.nextTriggerAt) : null;
          const isToday = next && next.toDateString() === now.toDateString();
          if (!isToday) return null;
          return {
            ...r,
            due: `${String(next!.getHours()).padStart(2, '0')}:${String(next!.getMinutes()).padStart(2, '0')}`,
            done: false,
          };
        })
        .filter((x): x is TodayReminder => x !== null)
        .sort((a, b) => a.due.localeCompare(b.due));
      setItems(today);
    } catch {
      // 静默
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const doneCount = items.filter((i) => i.done).length;
  const rate = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-md pb-20">
      <header className="px-4 pt-6">
        <h1 className="text-xl font-semibold">今日</h1>
        <p className="mt-1 text-sm text-ink-500">
          {user ? `你好，${user.username} · 准时提醒，温柔守护` : '准时提醒，温柔守护'}
        </p>
      </header>

      <main className="px-4">
        {/* 完成率卡片（完成记录在 M3 统计模块接入后为真实数据） */}
        <section className="mt-4 rounded-card bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-ink-500">今日完成率</p>
              <p className="mt-1 text-3xl font-bold text-primary-600">{rate}%</p>
              <p className="mt-1 text-xs text-ink-500">{doneCount} / {items.length} 已完成</p>
            </div>
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-50 text-primary-500">
              <TrendingUp size={32} strokeWidth={1.5} />
            </div>
          </div>
        </section>

        {/* 今日提醒时间轴 */}
        <section className="mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">今日提醒</h2>
            <button
              onClick={() => navigate('/reminders/new')}
              className="flex h-11 items-center gap-1 text-sm text-primary-600"
            >
              <Plus size={16} /> 新建
            </button>
          </div>

          {loading ? (
            <div className="mt-3 rounded-card bg-surface p-8 text-center text-sm text-ink-300 shadow-sm">
              加载中…
            </div>
          ) : items.length === 0 ? (
            <div className="mt-3 rounded-card bg-surface p-8 text-center text-sm text-ink-300 shadow-sm">
              今天还没有提醒
              <button
                onClick={() => navigate('/reminders/new')}
                className="mt-3 block w-full rounded-btn bg-primary-500 py-3 text-sm font-medium text-white"
              >
                创建今日提醒
              </button>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {items.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-card bg-surface px-4 py-3 shadow-sm">
                  <span className="w-14 text-right text-sm font-semibold text-primary-600">{r.due}</span>
                  <span className="text-lg">{CATEGORY_EMOJI[r.category] ?? '📌'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    {r.content.text && (
                      <p className="mt-0.5 truncate text-xs text-ink-500">{r.content.text}</p>
                    )}
                  </div>
                  {r.done && <span className="text-xs text-primary-600">✓ 完成</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
