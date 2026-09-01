import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { statsApi, DashboardStats, DayStat } from '../services/api/api.stats';

/** 热力图 4 档颜色映射（M5 完善：0 / 1-49 / 50-99 / 100%） */
const HEAT_COLORS = ['bg-ink-100', 'bg-primary-200', 'bg-primary-400', 'bg-primary-600'];

function heatColor(rate: number): string {
  if (rate <= 0) return HEAT_COLORS[0];
  if (rate < 50) return HEAT_COLORS[1];
  if (rate < 100) return HEAT_COLORS[2];
  return HEAT_COLORS[3];
}

/**
 * P-15 统计页（FR-703/705/706/707）
 * 连续天数 / 月热力图 / 7 日趋势 / 分类统计
 */
export function StatsPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [heatmap, setHeatmap] = useState<DayStat[]>([]);
  const [trend, setTrend] = useState<DayStat[]>([]);
  const [water, setWater] = useState<{ waterMl: number; waterGoalMl: number; rate: number; reached: boolean } | null>(null);
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    statsApi.dashboard().then(setStats).catch(() => undefined);
    statsApi.trend(7).then(setTrend).catch(() => undefined);
    statsApi.waterInfo().then(setWater).catch(() => undefined);
  }, []);

  useEffect(() => {
    statsApi.heatmap(month).then(setHeatmap).catch(() => undefined);
  }, [month]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const firstWeekday = heatmap.length > 0 ? new Date(heatmap[0].date + 'T00:00:00').getDay() : 0;

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
        <h1 className="flex-1 text-lg font-semibold">统计</h1>
      </header>

      <main className="space-y-4 px-4 pt-3">
        {/* 连续天数 + 今日 + 喝水（#2 重构：指标三卡合一） */}
        <section className="rounded-card bg-primary-500 p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70">连续坚持</p>
              <p className="mt-1 text-4xl font-bold">
                {stats?.streakDays ?? 0}
                <span className="ml-1 text-lg font-normal text-white/70">天</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-white/70">今日完成率</p>
              <p className="mt-1 text-2xl font-bold">{stats?.rate ?? 0}%</p>
              <p className="text-xs text-white/60">
                {stats?.done ?? 0}/{stats?.planned ?? 0}
                <span className="ml-1 opacity-80">（按提醒勾选计入）</span>
              </p>
            </div>
          </div>
          {water && (
            <div className="mt-4 border-t border-white/20 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-white/70">💧 今日喝水</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold">{water.waterMl}ml</span>
                  <span className="text-[10px] text-white/60">/ {water.waterGoalMl}ml</span>
                  {water.reached && (
                    <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-medium text-primary-600">
                      ✓ 达标
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white transition-all" style={{ width: `${water.rate}%` }} />
              </div>
            </div>
          )}
        </section>

        {/* 月热力图 */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1 text-sm font-medium">
              <CalendarDays size={14} /> 热力图
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => shiftMonth(-1)} className="px-2 text-ink-500">
                ‹
              </button>
              <span className="text-sm">{month}</span>
              <button onClick={() => shiftMonth(1)} className="px-2 text-ink-500">
                ›
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1.5 text-center">
            {weekDays.map((w) => (
              <span key={w} className="text-[10px] text-ink-300">
                {w}
              </span>
            ))}
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <span key={`e${i}`} />
            ))}
            {heatmap.map((d) => (
              <div key={d.date} className="flex flex-col items-center">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-md text-[10px] ${heatColor(d.rate)} ${
                    d.rate > 0 ? 'font-medium' : ''
                  }`}
                  title={`${d.date}: ${d.rate}%（${d.done}/${d.planned}）`}
                >
                  {d.planned > 0 ? d.rate : ''}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-ink-300">
            低
            {HEAT_COLORS.map((c) => (
              <span key={c} className={`h-3 w-3 rounded-sm ${c}`} />
            ))}
            高
          </div>
        </section>

        {/* 7 日趋势 */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <h2 className="text-sm font-medium">近 7 天趋势</h2>
          <div className="mt-3 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={trend}
                margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                accessibilityLayer={false}
              >
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => `${Number(d.slice(8))}日`}
                  tick={{ fontSize: 10, fill: '#6b7f79' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 10, fill: '#6b7f79' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'transparent', stroke: 'transparent' }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="rate" fill="#3e8e7e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 分类统计 */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <h2 className="text-sm font-medium">分类统计（今日）</h2>
          {stats && Object.keys(stats.categoryStats).length > 0 ? (
            <ul className="mt-3 space-y-2.5">
              {Object.entries(stats.categoryStats).map(([name, c]) => (
                <li key={name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-700">{name}</span>
                    <span className="text-xs text-ink-500">
                      {c.done}/{c.planned} · {c.rate}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-primary-500"
                      style={{ width: `${c.rate}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-500">今日暂无统计数据</p>
          )}
        </section>
      </main>
    </div>
  );
}
