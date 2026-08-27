import { BarChart3, Check, ChevronDown, ChevronLeft, ChevronRight, Plus, Settings } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { remindersApi } from '../services/api/api.reminders';
import { statsApi, DashboardStats, WaterInfo } from '../services/api/api.stats';
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
  if (mins < 1) return '即将提醒';
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
  const [addedFlash, setAddedFlash] = useState<number | null>(null);
  /** #6：已完成/已错过分组折叠 */
  const [doneOpen, setDoneOpen] = useState(false);
  const [missedOpen, setMissedOpen] = useState(false);
  /** #4：各日期独立喝水统计（key=YYYY-MM-DD） */
  const [waterStats, setWaterStats] = useState<Record<string, WaterInfo>>({});
  const touchX = useRef<number | null>(null);
  /** 当前列水数据（今天用 dashboard 的 water，其他列用 waterInfo） */
  const water = selected === today && stats ? stats.water : waterStats[selected];

  const load = useCallback(
    async (date: string) => {
      try {
        setItems(await remindersApi.calendar(date));
        if (date === today) {
          statsApi.dashboard().then(setStats).catch(() => undefined);
        }
        // #4：喝水按日期独立（各列显示/记录各自日期）
        statsApi.waterInfo(date).then((w) => setWaterStats((m) => ({ ...m, [date]: w }))).catch(() => undefined);
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
      // delayed（延迟执行中）不算错过，显示在待办
      // #4：不定时无固定时刻 → 永不判错过（保持 pending，可完成/放弃）
      isMissed:
        !item.untimed &&
        (t.status === 'missed' ||
          t.status === 'skipped' ||
          (t.status === null &&
            (selected < today || (selected === today && t.time < nowTime)))),
    })),
  );  // #18：间隔提醒（当日多次）聚合为**单卡**——不再在三个分组中重复出现
  const intervalIds = new Set(slots.filter((s) => isIntervalMulti(s.item)).map((s) => s.item.reminderId));
  const regularSlots = slots.filter((s) => !intervalIds.has(s.item.reminderId));
  const intervalItems = [
    ...new Map(
      slots
        .filter((s) => intervalIds.has(s.item.reminderId))
        .map((s) => [s.item.reminderId, s.item]),
    ).values(),
  ];
  const pendingSlots = regularSlots
    .filter((s) => !s.isDone && !s.isMissed)
    .sort((a, b) => a.time.localeCompare(b.time));
  const doneSlots = regularSlots
    .filter((s) => s.isDone)
    .sort((a, b) => a.time.localeCompare(b.time));
  const missedSlots = regularSlots
    .filter((s) => s.isMissed)
    .sort((a, b) => a.time.localeCompare(b.time));

  const totalDone = doneSlots.length;
  const totalPlanned = slots.length;
  const rate = totalPlanned > 0 ? Math.round((totalDone / totalPlanned) * 100) : 0;

  const lunar = lunarInfo(selected);
  // #14：今日前后天数差（不定时 ±3 天可确认）
  const dayDiff = Math.round(
    (new Date(`${selected}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000,
  );

  /** #12：不定时提醒 完成/放弃（今日）——记录到当日正午（ack 仅需唯一时刻） */
  const untimedAck = async (item: CalendarItem, status: 'completed' | 'skipped') => {
    const [y, m, d] = selected.split('-').map(Number);
    const noon = new Date(y, m - 1, d, 12, 0);
    try {
      await remindersApi.ack(item.reminderId, { status, scheduledTime: noon.toISOString() });
    } catch {
      /* 重复/失败静默，刷新后以服务端为准 */
    }
    void load(selected);
  };

  return (
    <div
      className="mx-auto max-w-md overflow-x-clip pb-20"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* 顶部日期头（#17：弹性布局，窄屏不产生横向滚动） */}
      <header className="px-4 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center">
            <button
              onClick={() => setSelected((s) => shiftKey(s, -1))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100"
              aria-label="前一天"
            >
              <ChevronLeft size={20} />
            </button>
            {/* 弹性宽度：日期文字变化不导致按钮偏移，窄屏自动收缩 */}
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-lg font-semibold">
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
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => navigate('/stats')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-primary-600 shadow-sm"
              aria-label="统计"
            >
              <BarChart3 size={18} />
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-700 shadow-sm"
              aria-label="设置"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

      </header>

      <main className="px-4">
        {/* 完成率 + 喝水并排（2026-08 改版：缩小为两列） */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <section className="rounded-card bg-surface p-4 shadow-sm">
            <p className="text-xs text-ink-500">完成率</p>
            <p className="mt-1 text-2xl font-bold text-primary-600">
              {selected === today && stats ? stats.rate : rate}%
            </p>
            <p className="mt-1 text-[11px] text-ink-500">
              {selected === today && stats ? stats.done : totalDone}/{selected === today && stats ? stats.planned : totalPlanned} 完成
            </p>
            {selected === today && missedSlots.length > 0 && (
              <p className="mt-0.5 text-[10px] text-danger-700">错过 {missedSlots.length}</p>
            )}
            {selected === today && stats && (
              <p className="mt-1.5 rounded-full bg-accent-100 px-2 py-0.5 text-center text-[10px] font-medium text-accent-700">
                🔥 连续 {stats.streakDays} 天
              </p>
            )}
          </section>

          <section
            className={`rounded-card p-4 shadow-sm transition-colors ${
              water && water.rate >= 100
                ? 'bg-gradient-to-r from-primary-500/15 to-primary-100/40 ring-2 ring-primary-500/60'
                : 'bg-surface'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-500">💧 喝水{selected !== today ? `（${selected.slice(5)}）` : ''}</p>
              {water && water.rate >= 100 && (
                <span className="animate-pop-in rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-medium text-white">
                  ✓ 目标达成
                </span>
              )}
              <div className="relative">
                {selected === today ? (
                  <button
                    onClick={async () => {
                      // #11：仅今日可记录
                      await statsApi.water(200).catch(() => undefined);
                      statsApi.dashboard().then(setStats).catch(() => undefined);
                      statsApi.waterInfo(selected).then((w) => setWaterStats((m) => ({ ...m, [selected]: w }))).catch(() => undefined);
                      const t = Date.now();
                      setAddedFlash(t);
                      setTimeout(() => setAddedFlash((v) => (v === t ? null : v)), 900);
                    }}
                    className="rounded-full bg-primary-500 px-2.5 py-1 text-[11px] font-medium text-white"
                  >
                    +200
                  </button>
                ) : (
                  <span
                    className="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-medium text-ink-300"
                    title="只能记录今天的水"
                  >
                    +200
                  </span>
                )}
                {addedFlash !== null && (
                  <span
                    key={addedFlash}
                    className="water-add-float pointer-events-none absolute -top-5 right-0 text-xs font-semibold text-primary-600"
                  >
                    +200ml ✦
                  </span>
                )}
              </div>
            </div>
            {water ? (
              <>
                <p className="mt-1 text-2xl font-bold text-primary-600">{water.waterMl}</p>
                <p className="text-[11px] text-ink-500">目标 {water.waterGoalMl}ml</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-primary-500 transition-all"
                    style={{ width: `${water.rate}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="mt-2 text-[11px] text-ink-300">记录喝水进度</p>
            )}
          </section>
        </div>

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
            <>
          {/* #18：间隔提醒单卡（已完成/未提醒/已错过 汇总 ×/N，点击展开明细） */}
          {intervalItems.length > 0 && (
            <div className="mt-3 space-y-2">
              {intervalItems.map((item) => (
                <IntervalCard
                  key={`iv-${item.reminderId}`}
                  item={item}
                  selected={selected}
                  today={today}
                  nowTime={nowTime}
                />
              ))}
            </div>
          )}
            <ul className="mt-3 space-y-2">
              {/* 未到时间点 */}
              {pendingSlots.map((s, i) => (
                <li
                  key={`p-${s.item.reminderId}-${s.time}-${i}`}
                  className="flex items-center gap-3 rounded-card bg-surface px-4 py-3 shadow-sm"
                >
                  <span className="w-14 text-right text-sm font-semibold text-primary-600">{s.item.untimed ? '不定时' : s.time}</span>
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
                    if (s.item.untimed) {
                      // #12/#14：不定时 — 完成/放弃（仅限今日前后 3 天可操作）
                      const canOperate = Math.abs(dayDiff) <= 3;
                      return canOperate ? (
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            onClick={() => void untimedAck(s.item, 'completed')}
                            className="rounded-full bg-primary-500 px-2.5 py-1 text-[11px] font-medium text-white"
                          >
                            完成
                          </button>
                          <button
                            onClick={() => void untimedAck(s.item, 'skipped')}
                            className="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-medium text-ink-600"
                          >
                            放弃
                          </button>
                        </div>
                      ) : (
                        <span className="shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-[10px] text-ink-300">
                          仅±3天可确认
                        </span>
                      );
                    }
                    // 距离该时间点触发的间隔（以当前看板日期/时间为基准；
                    // 不用 reminder.nextTriggerAt——它可能已推进到明天，导致"明天的提醒显示 10 分钟后"）
                    const label = untilLabel(selected, s.time);
                    return label ? (
                      <span className="shrink-0 rounded-full bg-primary-500/15 px-2.5 py-1 text-[11px] font-medium text-primary-700">
                        {label}
                      </span>
                    ) : null;
                  })()}
                </li>
              ))}
            </ul>
            </>
          )}

          {/* 已完成分组 */}
          {!loading && !error && doneSlots.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDoneOpen((v) => !v)}
                  className="flex items-center gap-2"
                  aria-expanded={doneOpen}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-[10px] text-white">
                    <Check size={12} />
                  </span>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-ink-500">
                    已完成（{doneSlots.length}）
                  </h3>
                  <ChevronDown size={13} className={`text-ink-400 transition-transform ${doneOpen ? '' : '-rotate-90'}`} />
                </button>
                <span className="h-px flex-1 bg-ink-100" />
              </div>
              {doneOpen && (
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
                      <span className="w-14 text-right text-sm font-semibold text-ink-500">{s.item.untimed ? '不定时' : s.time}</span>
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
              )}
            </div>
          )}

          {/* 已错过分组（今天已过未完成，醒目红色；#6 可折叠） */}
          {!loading && !error && missedSlots.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMissedOpen((v) => !v)}
                  className="flex items-center gap-2"
                  aria-expanded={missedOpen}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-danger-500 text-[10px] font-bold text-white">
                    !
                  </span>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-danger-700">
                    已错过（{missedSlots.length}）
                  </h3>
                  <ChevronDown size={13} className={`text-danger-400 transition-transform ${missedOpen ? '' : '-rotate-90'}`} />
                </button>
                <span className="h-px flex-1 bg-danger-500/30" />
              </div>
              {missedOpen && (
              <ul className="mt-2 space-y-2">
                {missedSlots.map((s, i) => {
                  return (
                  <li
                    key={`m-${s.item.reminderId}-${s.time}-${i}`}
                    className="flex items-center gap-3 rounded-card border-l-4 border-danger-500/70 bg-danger-500/5 px-4 py-3"
                  >
                    <span className="w-14 text-right text-sm font-semibold text-danger-700">{s.item.untimed ? '不定时' : s.time}</span>
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
                    {/* #4：已放弃（跳过）的允许再次确认完成 */}
                    {s.status === 'skipped' && (
                      <button
                        onClick={() => {
                          const noon = new Date(`${selected}T12:00:00`);
                          void remindersApi
                            .ack(s.item.reminderId, { status: 'completed', scheduledTime: noon.toISOString() })
                            .catch(() => undefined)
                            .then(() => load(selected));
                        }}
                        className="flex shrink-0 items-center gap-1 rounded-full bg-primary-500 px-2.5 py-1 text-[10px] font-medium text-white"
                      >
                        <Check size={11} /> 再次完成
                      </button>
                    )}
                  </li>
                );
              })}
              </ul>
              )}
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}

/**
 * #18：间隔提醒（当日多次）**单卡聚合**——不再按状态分成多张卡：
 * 顶部标注「已完成 z/N · 未提醒 p/N · 已错过 m/N」，点击展开明细（逐条列出状态）。
 */
function IntervalCard({
  item,
  selected,
  today,
  nowTime,
}: {
  item: CalendarItem;
  selected: string;
  today: string;
  nowTime: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = item.times.length;
  const done = item.times.filter((t) => t.status === 'completed' || t.status === 'challenge_completed').length;
  const missed = item.times.filter(
    (t) =>
      t.status === 'missed' ||
      t.status === 'skipped' ||
      (t.status === null && (selected < today || (selected === today && t.time < nowTime))),
  ).length;
  const pending = total - done - missed;
  const chip = (n: number, text: string, cls: string) =>
    n > 0 ? (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{text}</span>
    ) : null;
  const stateIcon = (status: string | null) =>
    status === 'completed' || status === 'challenge_completed'
      ? '✅'
      : status === 'skipped' || status === 'missed'
        ? '⭕'
        : '🕒';
  const stateLabel = (status: string | null) =>
    status === 'completed' || status === 'challenge_completed'
      ? '已完成'
      : status === 'skipped'
        ? '已放弃'
        : status === 'missed'
          ? '已错过'
          : '未提醒';
  return (
    <div className="rounded-card border-l-4 border-primary-500/50 bg-surface px-4 py-3 shadow-sm">
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-3 text-left" aria-expanded={expanded}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-lg">
          {item.categoryIcon ?? CATEGORY_EMOJI[item.category] ?? '📌'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.title}</span>
          <span className="mt-0.5 block truncate text-[11px] text-ink-500">
            每 {item.repeatRule?.intervalValue ?? 1} {(item.repeatRule?.intervalUnit as string) === 'minute' ? '分钟' : item.repeatRule?.intervalUnit === 'week' ? '周' : '小时'}
            <span className="text-ink-300"> · 共 {total} 次</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {chip(done, `已完成 ${done}/${total}`, 'bg-primary-500/15 text-primary-700')}
            {chip(pending, `未提醒 ${pending}/${total}`, 'bg-ink-100 text-ink-600')}
            {chip(missed, `已错过 ${missed}/${total}`, 'bg-danger-500/10 text-danger-700')}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-xs text-ink-400">
          {expanded ? '收起' : '查看详情'}
          <ChevronDown size={13} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} />
        </span>
      </button>
      {expanded && (
        <ul className="mt-2 space-y-1 border-t border-ink-100 pt-2">
          {item.times.map((t, i) => (
            <li key={i} className="flex items-center gap-2 px-1 text-xs">
              <span>{stateIcon(t.status)}</span>
              <span className="font-medium">{t.time}</span>
              <span className="ml-auto text-ink-400">{stateLabel(t.status)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** #4：间隔提醒（当日多次）聚合判定 */
function isIntervalMulti(item: CalendarItem): boolean {
  return item.repeatRule?.type === 'interval' && item.times.length > 1;
}
