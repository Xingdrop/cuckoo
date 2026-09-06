/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8c3JjL3BhZ2VzL1JlcG9ydFBhZ2UudHN4fDIwMjYtMDl8MTM1OTIwMTRiOA== */
import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorBanner, EmptyState, LoadingState } from '../components/ui/Feedback';
import { reportsApi } from '../services/api/api.reports';
import type { Report } from '../services/api/api.reports';
import { errorMessage } from '../services/http';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

/**
 * 报告详情（FR-704/705）：周报/月报内容展示。
 * 入口：通知中心点击 `/reports/:id`；数据由 ReportsService 定时/手动生成。
 */
export function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    reportsApi
      .get(id)
      .then(setReport)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  const d = report?.data;

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
          <h1 className="text-lg font-semibold">{d?.type === 'weekly' ? '周报' : '月报'}</h1>
          {d && <p className="text-xs text-ink-500">{d.period}</p>}
        </div>
      </header>

      <main className="space-y-4 px-4 pt-3">
        <ErrorBanner message={error} />
        {!report && !error && <LoadingState />}
        {error && <EmptyState>报告加载失败</EmptyState>}
        {d && (
          <>
            {/* 完成率 */}
            <section className="rounded-card bg-primary-500 p-5 text-white">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm text-white/70">
                    {d.type === 'weekly' && d.range ? `${fmtDate(d.range.start)} - ${fmtDate(d.range.end)}` : d.period}
                  </p>
                  <p className="mt-1 text-4xl font-bold">
                    {d.overallRate}
                    <span className="text-lg font-normal text-white/70">%</span>
                  </p>
                  <p className="mt-1 text-xs text-white/60">
                    {d.overall.done}/{d.overall.planned} 完成 · 错过 {d.overall.missed}
                  </p>
                </div>
                {typeof d.rateDelta === 'number' && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      d.rateDelta >= 0 ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'
                    }`}
                  >
                    {d.rateDelta >= 0 ? '▲' : '▼'} {Math.abs(d.rateDelta)}% 环比
                  </span>
                )}
              </div>
              {d.streakDays > 0 && (
                <p className="mt-3 border-t border-white/20 pt-2.5 text-sm">🔥 连续坚持 {d.streakDays} 天</p>
              )}
            </section>

            {/* 亮点 */}
            {(d.bestCategory || d.bestReminder) && (
              <section className="rounded-card bg-surface p-4 shadow-sm">
                <h2 className="text-sm font-medium">本周亮点</h2>
                <ul className="mt-2 space-y-1.5 text-sm text-ink-500">
                  {d.bestCategory && <li>🏅 最佳分类：{d.bestCategory}</li>}
                  {d.bestReminder && (
                    <li>⭐ 完成最多：「{d.bestReminder.title}」× {d.bestReminder.done} 次</li>
                  )}
                </ul>
              </section>
            )}

            {/* 分类统计 */}
            <section className="rounded-card bg-surface p-4 shadow-sm">
              <h2 className="text-sm font-medium">分类统计</h2>
              {d.categoryStats.length > 0 ? (
                <ul className="mt-3 space-y-2.5">
                  {d.categoryStats.map((c) => (
                    <li key={c.name}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink-700">{c.name}</span>
                        <span className="text-xs text-ink-500">
                          {c.done}/{c.planned} · {c.rate}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                        <div className="h-full rounded-full bg-primary-500" style={{ width: `${c.rate}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-ink-500">周期内暂无统计数据</p>
              )}
            </section>

            {/* 月报热力图 */}
            {d.heatmap && d.heatmap.length > 0 && (
              <section className="rounded-card bg-surface p-4 shadow-sm">
                <h2 className="text-sm font-medium">月度热力图</h2>
                <div className="mt-3 grid grid-cols-7 gap-1.5 text-center">
                  {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
                    <span key={w} className="text-[10px] text-ink-300">
                      {w}
                    </span>
                  ))}
                  {d.heatmap.map((day) => (
                    <div
                      key={day.date}
                      title={`${day.date}: ${day.rate}%`}
                      className={`flex h-8 items-center justify-center rounded-md text-[10px] ${
                        day.rate === 0
                          ? 'bg-ink-100'
                          : day.rate < 50
                            ? 'bg-primary-200 text-primary-800'
                            : day.rate < 100
                              ? 'bg-primary-400 text-white'
                              : 'bg-primary-600 text-white'
                      }`}
                    >
                      {day.planned > 0 ? day.rate : ''}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 建议 */}
            {d.suggestion && (
              <section className="rounded-card bg-accent-100 px-4 py-3 text-sm text-accent-700">
                💡 {d.suggestion}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
