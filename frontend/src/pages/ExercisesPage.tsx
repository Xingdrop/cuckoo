import { ChevronLeft, Clock, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { http, errorMessage } from '../services/http';

interface Exercise {
  id: string;
  name: string;
  steps: string;
  imageUrl: string | null;
  videoUrl: string | null;
  durationSeconds: number;
  category: string;
  sortOrder: number;
  isActive: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
  stretch: '拉伸',
  kegel: '提肛',
  neck: '颈部',
  eye: '眼部',
  stand: '站立',
  other: '其他',
};

/**
 * P-10 微运动库（FR-405）：浏览运动，一键加入提醒计划
 */
export function ExercisesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    http
      .get<Exercise[]>('/exercises')
      .then((r) => setItems(r.data))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const addToPlan = (ex: Exercise) => {
    // 预填内容跳转新建提醒
    navigate('/reminders/new', {
      state: {
        preset: {
          category: 'exercise',
          title: ex.name,
          contentText: `${ex.steps}\n（建议时长 ${ex.durationSeconds} 秒）`,
        },
      },
    });
  };

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
        <div>
          <h1 className="text-lg font-semibold">微运动库</h1>
          <p className="text-xs text-ink-500">30 秒到 5 分钟的小运动，随时可以开始</p>
        </div>
      </header>

      <main className="px-4 pt-3">
        {error && (
          <p className="mb-3 rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{error}</p>
        )}
        {loading ? (
          <div className="py-16 text-center text-sm text-ink-500">加载中…</div>
        ) : items.length === 0 ? (
          <div className="rounded-card bg-surface p-10 text-center text-sm text-ink-500 shadow-sm">
            运动库建设中
          </div>
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
                      <li key={ex.id} className="rounded-card bg-surface p-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{ex.name}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{ex.steps}</p>
                          </div>
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
    </div>
  );
}
