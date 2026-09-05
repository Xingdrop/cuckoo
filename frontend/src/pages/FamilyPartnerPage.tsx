import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EmptyState, ErrorBanner, LoadingState } from '../components/ui/Feedback';
import { familyApi, type PartnerSummary } from '../services/api/api.family';
import { absoluteUrl, errorMessage } from '../services/http';

const STATUS_LABEL: Record<string, string> = {
  completed: '已完成',
  challenge_completed: '挑战完成',
  delayed: '已延迟',
  skipped: '已跳过',
  missed: '已错过',
  photo: '照片记录',
  manual: '手动记录',
};

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-primary-500/10 text-primary-700',
  challenge_completed: 'bg-primary-500/10 text-primary-700',
  delayed: 'bg-warning-500/10 text-warning-600',
  skipped: 'bg-ink-100 text-ink-500',
  missed: 'bg-danger-500/10 text-danger-700',
  photo: 'bg-primary-50 text-primary-700',
};

const CATEGORY_LABEL: Record<string, string> = {
  medication: '用药',
  exercise: '运动',
  water: '喝水',
  rest: '休息',
  work: '工作',
  eye: '护眼',
  posture: '体态',
  custom: '自定义',
};

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 亲友健康摘要（只读）：完成情况 + 文字/照片记录 + 药品库存（FR-311） */
export function FamilyPartnerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState<PartnerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setData(await familyApi.partnerSummary(id, date));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, date]);

  useEffect(() => {
    void load();
  }, [load]);

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
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
          {data ? `${data.partner.username} 的健康摘要` : '健康摘要'}
        </h1>
      </header>
      <main className="px-4 pt-1">
        {/* 日期切换 */}
        <div className="mb-3 flex items-center justify-between rounded-card bg-surface px-2 py-1.5 shadow-sm">
          <button
            onClick={() => setDate(shiftDate(date, -1))}
            className="flex h-9 w-9 items-center justify-center text-ink-600"
            aria-label="前一天"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium">
            {date === todayStr() ? '今天' : date}
          </span>
          <button
            onClick={() => setDate(shiftDate(date, 1))}
            disabled={date >= todayStr()}
            className="flex h-9 w-9 items-center justify-center text-ink-600 disabled:opacity-30"
            aria-label="后一天"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <ErrorBanner message={error} />
        {loading && !data ? (
          <LoadingState />
        ) : data ? (
          <>
            {/* 完成率摘要 */}
            <section className="grid grid-cols-4 gap-2 rounded-card bg-surface p-4 shadow-sm">
              <div className="text-center">
                <p className="text-xl font-bold text-primary-600">{data.summary.rate}%</p>
                <p className="mt-0.5 text-[11px] text-ink-500">完成率</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold">
                  {data.summary.done}
                  <span className="text-xs font-normal text-ink-400">/{data.summary.planned}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-ink-500">完成/计划</p>
              </div>
              <div className="text-center">
                <p className={`text-xl font-bold ${data.summary.missed > 0 ? 'text-danger-600' : ''}`}>
                  {data.summary.missed}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-500">错过</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold">
                  {data.summary.waterMl}
                  <span className="text-xs font-normal text-ink-400">/{data.summary.waterGoalMl}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-ink-500">水量(ml)</p>
              </div>
            </section>

            {/* 当日提醒 */}
            <section className="mt-3 rounded-card bg-surface p-4 shadow-sm">
              <h2 className="text-sm font-semibold">提醒完成情况</h2>
              {data.reminders.length === 0 ? (
                <p className="mt-3 text-xs text-ink-500">这一天没有安排提醒</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {data.reminders.map((r) => (
                    <li key={r.reminderId} className="border-b border-ink-100 pb-3 last:border-0 last:pb-0">
                      <p className="text-sm font-medium">
                        {r.categoryIcon ?? ''}
                        {CATEGORY_LABEL[r.category] ?? r.categoryLabel ?? '提醒'} · {r.title}
                      </p>
                      <ul className="mt-1.5 space-y-1.5">
                        {r.times.map((t, i) => (
                          <li key={`${t.time}-${i}`} className="flex items-center gap-2 text-xs">
                            <span className="w-11 shrink-0 font-mono text-ink-500">{t.time}</span>
                            {t.status ? (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  STATUS_STYLE[t.status] ?? 'bg-ink-100 text-ink-600'
                                }`}
                              >
                                {STATUS_LABEL[t.status] ?? t.status}
                              </span>
                            ) : (
                              <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[11px] text-ink-400">待执行</span>
                            )}
                            {t.photoUrl && (
                              <img
                                src={absoluteUrl(t.photoUrl)}
                                alt="打卡照片"
                                className="h-9 w-9 rounded-md object-cover"
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 照片记录 */}
            <section className="mt-3 rounded-card bg-surface p-4 shadow-sm">
              <h2 className="text-sm font-semibold">照片记录（{data.photoLogs.length}）</h2>
              {data.photoLogs.length === 0 ? (
                <p className="mt-3 text-xs text-ink-500">这一天没有照片记录</p>
              ) : (
                <ul className="mt-3 grid grid-cols-3 gap-2">
                  {data.photoLogs.map((p, i) => (
                    <li key={i} className="overflow-hidden rounded-lg">
                      <img src={absoluteUrl(p.photoUrl)} alt={p.reminderTitle ?? '照片'} className="aspect-square w-full object-cover" />
                      <p className="mt-0.5 truncate text-[10px] text-ink-500">
                        {p.time} {p.reminderTitle ?? ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 药品库存 */}
            <section className="mt-3 rounded-card bg-surface p-4 shadow-sm">
              <h2 className="text-sm font-semibold">药品库存</h2>
              {data.medicines.length === 0 ? (
                <p className="mt-3 text-xs text-ink-500">没有药品记录</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.medicines.map((med) => (
                    <li key={med.id} className="flex items-center justify-between gap-2 rounded-card border border-ink-100 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{med.name}</p>
                        <p className="truncate text-xs text-ink-500">
                          {[med.dosage, med.instructions].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-bold ${med.stock <= med.threshold ? 'text-danger-600' : ''}`}>
                          {med.stock}
                        </p>
                        <p className="text-[10px] text-ink-400">
                          {med.stock <= med.threshold ? `低于阈值 ${med.threshold}` : `阈值 ${med.threshold}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-400">
              以上为只读摘要 · 时区按对方设置显示 · 可随时在「亲友」页解除绑定
            </p>
          </>
        ) : (
          <EmptyState>无法加载健康摘要</EmptyState>
        )}
      </main>
    </div>
  );
}
