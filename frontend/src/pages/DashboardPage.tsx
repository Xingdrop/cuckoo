import { BarChart3, Check, ChevronLeft, ChevronRight, Plus, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { remindersApi } from '../services/api/api.reminders';
import { statsApi, DashboardStats } from '../services/api/api.stats';
import { dateHead, festivalIcon, lunarInfo, shiftKey, todayKey } from '../utils/calendar';
import type { CalendarItem } from '../types';

const CATEGORY_EMOJI: Record<string, string> = {
  medication: '💊',
  exercise: '🏃',
  water: '💧',
  rest: '😴',
  work: '💼',
  custom: '📌',
};

/** 完成的次数（仅 completed/challenge_completed，不含错过/跳过） */
function doneCount(item: CalendarItem): number {
  return item.times.filter(
    (t) => t.status === 'completed' || t.status === 'challenge_completed',
  ).length;
}

/** 错过的次数（missed/skipped 状态，或未完成且时间已过） */
function missedCount(item: CalendarItem, dateKey: string, today: string, nowTime: string): number {
  return item.times.filter(
    (t) =>
      t.status === 'missed' ||
      t.status === 'skipped' ||
      (t.status === null && (dateKey < today || (dateKey === today && t.time < nowTime))),
  ).length;
}

/** 距目标时间（日期+HH:mm，本地）的间隔文案 */
function untilLabel(dateKey: string, time: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const diffMs = new Date(y, m - 1, d, hh, mm).getTime() - Date.now();
  if (diffMs <= 0) return '';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} 分钟后`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem > 0 ? `${hours} 小时 ${rem} 分后` : `${hours} 小时后`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH > 0 ? `${days} 天 ${remH} 小时后` : `${days} 天后`;
}

/**
 * P-03 今日看板（日期切换版）
 * - 顶部：日期 + 农历/节日 + 快捷导航（3天前~3天后）+ 左右滑动切换
 * - 未到时间点：正常色按时间排列（已提醒过的显示 k/n 徽标）
 * - 已完成时间点：暗色 + ✓ + 绿色边框，排在下方的"已完成"分组
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const today = todayKey();
  const [selected, setSelected] = useState(today);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const touchX = useRef<number | null>(null);

  const load = useCallback(
    async (date: string) => {
      try {
        setItems(await remindersApi.calendar(date));
        if (date === today) {
          statsApi.dashboard().then(setStats).catch(() => undefined);
        }
      } catch {
        setError('加载失败，请刷新重试');
      } finally {
        setLoading(false);
      }
    },
    [today],
  );

  // 切换日期时不显示"加载中"（保留旧内容直到新数据就绪）
  useEffect(() => {
    setError(null);
    void load(selected);
  }, [selected, load]);

  // 左右滑动切换日期（横向位移 > 50px）
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (dx > 50) setSelected((s) => shiftKey(s, -1)); // 右滑 → 前一天
    else if (dx < -50) setSelected((s) => shiftKey(s, 1)); // 左滑 → 后一天
  };

  // 展开时间线：未完成（按时间）+ 已完成（按时间）
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const slots = items.flatMap((item) =>
    item.times.map((t) => ({
      time: t.time,
      status: t.status,
      item,
      isDone: t.status === 'completed' || t.status === 'challenge_completed',
      // 已错过：missed/skipped 状态，或（未完成 且 时间已过：今天已过 / 历史日期）
      isMissed:
        t.status === 'missed' ||
        t.status === 'skipped' ||
        (t.status === null &&
          (selected < today || (selected === today && t.time < nowTime))),
    })),
  );
  const pendingSlots = slots
    .filter((s) => !s.isDone && !s.isMissed)
    .sort((a, b) => a.time.localeCompare(b.time));
  const doneSlots = slots
    .filter((s) => s.isDone)
    .sort((a, b) => a.time.localeCompare(b.time));
  const missedSlots = slots
    .filter((s) => s.isMissed)
    .sort((a, b) => a.time.localeCompare(b.time));

  const totalDone = doneSlots.length;
  const totalPlanned = slots.length;
  const rate = totalPlanned > 0 ? Math.round((totalDone / totalPlanned) * 100) : 0;

  const lunar = lunarInfo(selected);

  return (
    <div
      className="mx-auto max-w-md pb-20"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* 顶部日期头 */}
      <header className="px-4 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={() => setSelected((s) => shiftKey(s, -1))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100"
              aria-label="前一天"
            >
              <ChevronLeft size={20} />
            </button>
            {/* 固定宽度：日期文字变化不导致按钮偏移 */}
            <div className="w-48 shrink-0 text-center">
              <p className="text-lg font-semibold">
                {dateHead(selected)}
                {selected === today && (
                  <span className="ml-1.5 rounded-full bg-primary-500 px-2 py-0.5 align-middle text-[10px] text-white">
                    今天
                  </span>
                )}
              </p>
              <p className="mt-0.5 truncate text-xs text-ink-500">
                {lunar.festival ? `${festivalIcon(lunar.festival)} ${lunar.festival} · ` : ''}
                {lunar.lunar}
              </p>
            </div>
            <button
              onClick={() => setSelected((s) => shiftKey(s, 1))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100"
              aria-label="后一天"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="flex items-center gap-1 text-sm text-ink-700">
            <button
              onClick={() => navigate('/stats')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-primary-600 shadow-sm"
              aria-label="统计"
            >
              <BarChart3 size={18} />
            </button>
          </div>
        </div>

      </header>

      <main className="px-4">
        {/* 完成率卡片（stats 数据） */}
        <section className="mt-4 rounded-card bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-ink-500">完成率</p>
              <p className="mt-1 text-3xl font-bold text-primary-600">
                {selected === today && stats ? stats.rate : rate}%
              </p>
              <p className="mt-1 text-xs text-ink-500">
                {selected === today && stats ? stats.done : totalDone} / {selected === today && stats ? stats.planned : totalPlanned} 已完成
                {selected === today && stats && stats.missed > 0 && (
                  <span className="ml-1 text-danger-700">（错过 {stats.missed}）</span>
                )}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-50 text-primary-500">
                <TrendingUp size={32} strokeWidth={1.5} />
              </div>
              {selected === today && stats && (
                <span className="rounded-full bg-accent-100 px-2.5 py-1 text-[10px] font-medium text-accent-700">
                  🔥 连续 {stats.streakDays} 天
                </span>
              )}
            </div>
          </div>
        </section>

        {/* 喝水进度（今天） */}
        {selected === today && stats && (
          <section className="mt-3 rounded-card bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">💧 今日喝水</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-primary-600">
                  {stats.water.waterMl} / {stats.water.waterGoalMl}ml
                </span>
                <button
                  onClick={async () => {
                    await statsApi.water(200).catch(() => undefined);
                    statsApi.dashboard().then(setStats).catch(() => undefined);
                  }}
                  className="rounded-full bg-primary-500 px-3 py-1.5 text-xs font-medium text-white"
                >
                  +200ml
                </button>
              </div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-primary-500 transition-all"
                style={{ width: `${stats.water.rate}%` }}
              />
            </div>
          </section>
        )}

        {/* 当日提醒时间线 */}
        <section className="mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">当日提醒</h2>
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
          ) : slots.length === 0 ? (
            <div className="mt-3 rounded-card bg-surface p-8 text-center text-sm text-ink-500 shadow-sm">
              暂无提醒
              {selected === today && (
                <button
                  onClick={() => navigate('/reminders/new')}
                  className="mt-3 block w-full rounded-btn bg-primary-500 py-3 text-sm font-medium text-white"
                >
                  创建今日提醒
                </button>
              )}
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {/* 未到时间点 */}
              {pendingSlots.map((s, i) => (
                <li
                  key={`p-${s.item.reminderId}-${s.time}-${i}`}
                  className="flex items-center gap-3 rounded-card bg-surface px-4 py-3 shadow-sm"
                >
                  <span className="w-14 text-right text-sm font-semibold text-primary-600">{s.time}</span>
                  <span className="text-lg">
                    {s.item.categoryIcon ?? CATEGORY_EMOJI[s.item.category] ?? '📌'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {s.item.category === 'custom' && s.item.categoryLabel
                        ? `${s.item.categoryLabel} · `
                        : ''}
                      {s.item.title}
                    </p>
                    {s.item.content.text && (
                      <p className="mt-0.5 truncate text-xs text-ink-500">{s.item.content.text}</p>
                    )}
                  </div>
                  {(() => {
                    const label = untilLabel(selected, s.time);
                    return label ? (
                      <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-600">
                        ⏰ {label}
                      </span>
                    ) : null;
                  })()}
                </li>
              ))}
            </ul>
          )}

          {/* 已完成分组 */}
          {!loading && !error && doneSlots.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-[10px] text-white">
                  <Check size={12} />
                </span>
                <h3 className="text-xs font-medium uppercase tracking-wide text-ink-500">
                  已完成（{doneSlots.length}）
                </h3>
                <span className="h-px flex-1 bg-ink-100" />
              </div>
              <ul className="mt-2 space-y-2">
                {doneSlots.map((s, i) => {
                  const k = doneCount(s.item);
                  // 分母 = 有效计划数（总次数 - 错过次数），错过不计入
                  const effective = Math.max(1, s.item.todayTotal - missedCount(s.item, selected, today, nowTime));
                  return (
                    <li
                      key={`d-${s.item.reminderId}-${s.time}-${i}`}
                      className="flex items-center gap-3 rounded-card border-l-4 border-primary-500/60 bg-ink-100/60 px-4 py-3 opacity-80"
                    >
                      <span className="w-14 text-right text-sm font-semibold text-ink-500">{s.time}</span>
                      <span className="text-lg opacity-50">
                        {s.item.categoryIcon ?? CATEGORY_EMOJI[s.item.category] ?? '📌'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink-500 line-through decoration-ink-300">
                          {s.item.category === 'custom' && s.item.categoryLabel
                            ? `${s.item.categoryLabel} · `
                            : ''}
                          {s.item.title}
                        </p>
                        {s.item.content.text && (
                          <p className="mt-0.5 truncate text-xs text-ink-500/70">{s.item.content.text}</p>
                        )}
                      </div>
                      {effective > 1 ? (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary-500/15 px-2.5 py-1 text-[10px] font-medium text-primary-700">
                          <Check size={11} /> 已完成 {k}/{effective} 次
                        </span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary-500 px-2.5 py-1 text-[10px] font-medium text-white">
                          <Check size={11} /> 今日已完成提醒
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* 已错过分组（今天已过未完成，醒目红色） */}
          {!loading && !error && missedSlots.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-danger-500 text-[10px] font-bold text-white">
                  !
                </span>
                <h3 className="text-xs font-medium uppercase tracking-wide text-danger-700">
                  已错过（{missedSlots.length}）
                </h3>
                <span className="h-px flex-1 bg-danger-500/30" />
              </div>
              <ul className="mt-2 space-y-2">
                {missedSlots.map((s, i) => (
                  <li
                    key={`m-${s.item.reminderId}-${s.time}-${i}`}
                    className="flex items-center gap-3 rounded-card border-l-4 border-danger-500/70 bg-danger-500/5 px-4 py-3"
                  >
                    <span className="w-14 text-right text-sm font-semibold text-danger-700">{s.time}</span>
                    <span className="text-lg opacity-60">
                      {s.item.categoryIcon ?? CATEGORY_EMOJI[s.item.category] ?? '📌'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-danger-700">
                        {s.item.category === 'custom' && s.item.categoryLabel
                          ? `${s.item.categoryLabel} · `
                          : ''}
                        {s.item.title}
                      </p>
                      {s.item.content.text && (
                        <p className="mt-0.5 truncate text-xs text-danger-700/70">{s.item.content.text}</p>
                      )}
                    </div>
                    {s.status === 'skipped' ? (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-ink-300 px-2.5 py-1 text-[10px] font-medium text-white">
                        ↷ 已跳过
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-danger-500 px-2.5 py-1 text-[10px] font-medium text-white">
                        ✗ 已错过
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
