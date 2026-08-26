import { ChevronLeft, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingState } from '../components/ui/Feedback';
import { socialApi } from '../services/api/api.social';
import type { PlanTemplate } from '../services/api/api.social';

const CATEGORY_EMOJI: Record<string, string> = {
  medication: '💊',
  exercise: '🏃',
  water: '💧',
  rest: '😴',
  work: '💼',
  custom: '📌',
};

/** 官方计划详情（预览）：标题/说明/提醒配置清单 + 一键加入 */
export function TemplatePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tpl, setTpl] = useState<PlanTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!id) return;
    socialApi
      .template(id)
      .then(setTpl)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [id]);

  const join = async () => {
    if (!tpl || joining) return;
    setJoining(true);
    try {
      const r = await socialApi.joinTemplate(tpl.id);
      setJoined(true);
      if ((r as { duplicate?: boolean }).duplicate) {
        navigate('/plans');
      }
    } finally {
      setJoining(false);
      setLoading(false);
    }
  };

  const configs = (tpl?.reminderConfig ?? []) as Array<{
    category?: string;
    title?: string;
    startTime?: string;
    content?: Record<string, unknown>;
  }>;

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
        <h1 className="text-lg font-semibold">官方计划</h1>
      </header>
      <main className="px-4 pt-3">
        {loading ? (
          <LoadingState />
        ) : !tpl ? (
          <div className="rounded-card bg-surface p-8 text-center text-sm text-ink-400 shadow-sm">
            计划不存在或已下架
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-card bg-surface p-5 text-center shadow-sm">
              <span className="text-3xl">🏛️</span>
              <h2 className="mt-2 text-lg font-semibold">{tpl.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">{tpl.description}</p>
              <p className="mt-2 text-[11px] text-ink-400">共 {configs.length} 条提醒</p>
            </section>

            <section>
              <h3 className="mb-2 px-1 text-sm font-medium text-ink-700">提醒清单</h3>
              <ul className="space-y-2">
                {configs.map((c, i) => (
                  <li key={i} className="rounded-card bg-surface px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-lg">
                        {CATEGORY_EMOJI[c.category ?? 'custom'] ?? '📌'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.title ?? '未命名提醒'}</p>
                        <p className="text-[11px] text-ink-500">
                          {c.startTime ? `每天 ${c.startTime}` : '每天（不定时）'}
                          {c.content?.text ? ` · ${String(c.content.text)}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] text-primary-600">
                        {c.startTime ? '定时' : '不定时'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <button
              onClick={() => void join()}
              disabled={joining || joined}
              className="flex w-full items-center justify-center gap-1 rounded-btn bg-primary-500 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              <Plus size={15} />
              {joined ? '✓ 已加入我的计划（可在我的计划中管理）' : joining ? '加入中…' : '一键加入我的计划'}
            </button>
            <p className="px-1 text-[11px] text-ink-400">
              加入后计划进入「我的计划」，提醒跟随计划启停，可修改时间或删除
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
