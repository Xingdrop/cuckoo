/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3BhZ2VzL0V4ZXJjaXNlc1BhZ2UudHN4fDIwMjYtMDl8ZjE0NzNjMmEyMg== */
import { ChevronLeft, Clock, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorBanner, EmptyState, LoadingState } from '../components/ui/Feedback';
import { exercisesApi } from '../services/api/api.exercises';
import type { Exercise } from '../services/api/api.exercises';
import { errorMessage } from '../services/http';
import { RImg } from '../components/remoteMedia';
import { MediaCarousel } from '../components/MediaCarousel';

const CATEGORY_LABEL: Record<string, string> = {
  stretch: '拉伸',
  kegel: '提肛',
  neck: '颈部',
  eye: '眼部',
  stand: '站立',
  other: '其他',
};

/**
 * P-10 微运动库（FR-405）：浏览运动（配跟练图解），一键加入提醒计划
 */
export function ExercisesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 动作详情浮窗（跟练组图轮播 + 步骤说明） */
  const [detail, setDetail] = useState<Exercise | null>(null);

  useEffect(() => {
    exercisesApi
      .list()
      .then(setItems)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const addToPlan = (ex: Exercise) => {
    // 预填内容跳转新建提醒（配图一并带入，提醒触发时可看跟练图）
    navigate('/reminders/new', {
      state: {
        preset: {
          category: 'exercise',
          title: ex.name,
          contentText: `${ex.steps}\n（建议时长 ${ex.durationSeconds} 秒）`,
          contentImage: ex.imageUrl ?? undefined,
        },
      },
    });
  };

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
          <h1 className="text-lg font-semibold">微运动库</h1>
          <p className="text-xs text-ink-500">
            {items.length > 0 ? `${items.length} 个跟练动作` : '30 秒到 5 分钟的小运动'}，随时可以开始
          </p>
        </div>
      </header>

      <main className="px-4 pt-3">
        <ErrorBanner message={error} />
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState>运动库建设中</EmptyState>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORY_LABEL).map(([key, label]) => {
              const group = items.filter((x) => x.category === key);
              if (group.length === 0) return null;
              return (
                <div key={key} className="w-full">
                  <h2 className="px-1 pb-1.5 pt-2 text-xs font-medium text-ink-500">{label}</h2>
                  <ul className="space-y-2">
                    {group.map((ex) => (
                      <li key={ex.id} className="rounded-card bg-surface p-3 shadow-sm">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setDetail(ex)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            aria-label={`查看${ex.name}详情`}
                          >
                            {ex.imageUrl && (
                              <RImg
                                src={ex.imageUrl}
                                alt=""
                                loading="lazy"
                                className="h-16 w-16 shrink-0 rounded-card bg-bg object-cover"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{ex.name}</p>
                              <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{ex.steps}</p>
                            </div>
                          </button>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <span className="flex items-center gap-0.5 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] text-ink-500">
                              <Clock size={10} /> {ex.durationSeconds}s
                            </span>
                            <button
                              onClick={() => addToPlan(ex)}
                              className="flex items-center gap-0.5 rounded-full bg-primary-500 px-3 py-1.5 text-[11px] font-medium text-white"
                            >
                              <Plus size={11} /> 加入计划
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 动作详情浮窗：跟练组图 + 步骤 */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-5" onClick={() => setDetail(null)}>
          <div
            className="max-h-[82dvh] w-full max-w-sm overflow-y-auto rounded-card bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2.5 px-4 pb-1 pt-4">
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold">{detail.name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-500">
                  <Clock size={11} /> 建议 {detail.durationSeconds} 秒 · 跟练 {detail.imageUrls?.length ?? 1} 帧
                </p>
              </div>
              <button
                onClick={() => setDetail(null)}
                aria-label="关闭详情"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600"
              >
                <X size={15} />
              </button>
            </div>
            <div className="space-y-3 px-4 pb-4 pt-2">
              <MediaCarousel urls={(detail.imageUrls?.length ? detail.imageUrls : [detail.imageUrl].filter(Boolean)) as string[]} aspect="aspect-[4/3]" />
              <p className="rounded-card bg-bg px-3.5 py-3 text-sm leading-relaxed text-ink-700">{detail.steps}</p>
              <button
                onClick={() => {
                  addToPlan(detail);
                  setDetail(null);
                }}
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-btn bg-primary-500 text-sm font-medium text-white"
              >
                <Plus size={15} /> 加入计划
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
