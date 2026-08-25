import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingState } from '../components/ui/Feedback';
import { socialApi } from '../services/api/api.social';
import type { Post } from '../services/api/api.social';

interface SnapshotReminder {
  category?: string;
  title?: string;
  repeatRule?: { type?: string };
  times?: string[];
  content?: Record<string, unknown>;
}

const CATEGORY_EMOJI: Record<string, string> = {
  medication: '💊',
  exercise: '🏃',
  water: '💧',
  rest: '😴',
  work: '💼',
  custom: '📌',
};

/**
 * #2：帖子计划详情预览——展示快照中的计划名与提醒列表（/posts/:id/plan）。
 * 数据源 = 帖子 planSnapshot（加入前即可查看）。
 */
export function PlanPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    socialApi
      .getPost(id)
      .then(setPost)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [id]);

  const snapshot = post?.planSnapshot as
    | { from?: { name?: string }; reminders?: SnapshotReminder[] }
    | null
    | undefined;
  const reminders = snapshot?.reminders ?? [];

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
        <h1 className="text-lg font-semibold">计划详情</h1>
      </header>
      <main className="px-4 pt-3">
        {loading ? (
          <LoadingState />
        ) : !snapshot ? (
          <div className="rounded-card bg-surface p-8 text-center text-sm text-ink-400 shadow-sm">
            这条帖子没有关联计划
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-card bg-surface p-5 text-center shadow-sm">
              <span className="text-3xl">📋</span>
              <h2 className="mt-2 text-lg font-semibold">{snapshot.from?.name || '分享的计划'}</h2>
              <p className="mt-1 text-xs text-ink-500">共 {reminders.length} 条提醒</p>
            </section>
            <section>
              <h3 className="mb-2 px-1 text-sm font-medium text-ink-700">提醒清单</h3>
              <ul className="space-y-2">
                {reminders.map((r, i) => (
                  <li key={i} className="rounded-card bg-surface px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-lg">
                        {CATEGORY_EMOJI[r.category ?? 'custom'] ?? '📌'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.title || '未命名提醒'}</p>
                        <p className="text-[11px] text-ink-500">
                          {r.repeatRule?.type === 'daily'
                            ? `每天${r.times?.length ? ` ${r.times.join('/')}` : '（不定时）'}`
                            : r.repeatRule?.type === 'weekly'
                              ? '每周'
                              : '每天'}
                          {r.content?.text ? ` · ${String(r.content.text)}` : ''}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <p className="px-1 text-[11px] text-ink-400">点击帖子详情页的「一键加入」即可把该计划加入你的「我的计划」</p>
          </div>
        )}
      </main>
    </div>
  );
}
