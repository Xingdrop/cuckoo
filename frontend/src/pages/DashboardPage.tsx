import { Check, ChevronDown, Plus, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { useAuthStore } from '../stores/authStore';
import { remindersApi } from '../services/api/api.reminders';
import type { TodayReminder } from '../types';

const CATEGORY_EMOJI: Record<string, string> = {
  medication: '💊',
  exercise: '🏃',
  water: '💧',
  rest: '😴',
  work: '💼',
  custom: '📌',
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 完成的次数（completed / challenge_completed） */
function doneCount(r: TodayReminder): number {
  return r.todayLogs.filter((l) => l.status === 'completed' || l.status === 'challenge_completed').length;
}

/**
 * P-03 今日看板（FR-701 基础版 + 多时间点）
 * - 未到提醒：按时间升序（今日已提醒过的显示"已提醒 n 次"徽标）
 * - 已完成提醒：暗色 + ✓ 标识，按完成时间排在未到提醒下方；多次完成折叠
 */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [items, setItems] = useState<TodayReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await remindersApi.today());
    } catch {
      setError('加载失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const now = new Date();
  const hasUpcoming = (r: TodayReminder) =>
    Boolean(r.nextTriggerAt) && new Date(r.nextTriggerAt!) > now;
  const hasDone = (r: TodayReminder) => doneCount(r) > 0;

  // 未到：下次触发在未来（含今日已提醒过的，显示徽标）
  const pending = items
    .filter(hasUpcoming)
    .sort((a, b) => new Date(a.nextTriggerAt!).getTime() - new Date(b.nextTriggerAt!).getTime());
  // 已完成：今日全部完成、无未到时间点 → 按最后完成时间升序排下方
  const done = items
    .filter((r) => hasDone(r) && !hasUpcoming(r))
    .sort(
      (a, b) =>
        new Date(a.todayLogs[a.todayLogs.length - 1].scheduledTime).getTime() -
        new Date(b.todayLogs[b.todayLogs.length - 1].scheduledTime).getTime(),
    );

  const totalDone = items.reduce((sum, r) => sum + doneCount(r), 0);
  const totalPlanned = pending.length + done.length;
  const rate = totalPlanned > 0 ? Math.round((totalDone / totalPlanned) * 100) : 0;

  return (
    <div className="mx-auto max-w-md pb-20">
      <header className="px-4 pt-6">
        <h1 className="text-xl font-semibold">今日</h1>
        <p className="mt-1 text-sm text-ink-500">
          {user ? `你好，${user.username} · 准时提醒，温柔守护` : '准时提醒，温柔守护'}
        </p>
      </header>

      <main className="px-4">
        {/* 完成率卡片 */}
        <section className="mt-4 rounded-card bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-ink-500">今日完成率</p>
              <p className="mt-1 text-3xl font-bold text-primary-600">{rate}%</p>
              <p className="mt-1 text-xs text-ink-500">{totalDone} / {totalPlanned} 已完成</p>
            </div>
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-50 text-primary-500">
              <TrendingUp size={32} strokeWidth={1.5} />
            </div>
          </div>
        </section>

        {/* 今日提醒 */}
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

          {error && (
            <p className="mt-3 rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{error}</p>
          )}
          {loading ? (
            <div className="mt-3 rounded-card bg-surface p-8 text-center text-sm text-ink-500 shadow-sm">
              加载中…
            </div>
          ) : items.length === 0 ? (
            <div className="mt-3 rounded-card bg-surface p-8 text-center text-sm text-ink-500 shadow-sm">
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
              {/* 未到提醒（正常色） */}
              {pending.map((r) => {
                const n = doneCount(r);
                return (
                  <li key={r.id} className="flex items-center gap-3 rounded-card bg-surface px-4 py-3 shadow-sm">
                    <span className="w-14 text-right text-sm font-semibold text-primary-600">
                      {fmtTime(r.nextTriggerAt!)}
                    </span>
                    <span className="text-lg">{CATEGORY_EMOJI[r.category] ?? '📌'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      {r.content.text && (
                        <p className="mt-0.5 truncate text-xs text-ink-500">{r.content.text}</p>
                      )}
                    </div>
                    {n > 0 && (
                      <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] text-primary-600">
                        今日已提醒 {n} 次
                      </span>
                    )}
                  </li>
                );
              })}

              {/* 已完成提醒（暗色 + ✓，排在下方） */}
              {done.map((r) => {
                const n = doneCount(r);
                const lastTime = fmtTime(r.todayLogs[r.todayLogs.length - 1].scheduledTime);
                return (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 rounded-card bg-ink-100/50 px-4 py-3"
                  >
                    <span className="w-14 text-right text-sm font-semibold text-ink-500">{lastTime}</span>
                    <span className="text-lg opacity-50">{CATEGORY_EMOJI[r.category] ?? '📌'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink-500 line-through">{r.title}</p>
                      {r.content.text && (
                        <p className="mt-0.5 truncate text-xs text-ink-500/70">{r.content.text}</p>
                      )}
                    </div>
                    {n > 1 ? (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary-500/10 px-2 py-0.5 text-[10px] text-primary-600">
                        <Check size={11} /> 今日已提醒 {n} 次
                        <ChevronDown size={11} />
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary-500 px-2 py-0.5 text-[10px] text-white">
                        <Check size={11} /> 已完成
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
