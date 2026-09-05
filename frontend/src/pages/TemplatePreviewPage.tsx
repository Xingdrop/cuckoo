/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3BhZ2VzL1RlbXBsYXRlUHJldmlld1BhZ2UudHN4fDIwMjYtMDl8ZDg5YTVmMWE0Mw== */
import { ChevronLeft, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingState } from '../components/ui/Feedback';
import { MediaCarousel } from '../components/MediaCarousel';
import { useConnectionStore } from '../stores/connectionStore';
import { socialApi } from '../services/api/api.social';
import { absoluteUrl } from '../services/http';
import type { PlanTemplate } from '../services/api/api.social';

const CATEGORY_EMOJI: Record<string, string> = {
  medication: '💊',
  exercise: '🏃',
  water: '💧',
  rest: '😴',
  work: '💼',
  custom: '📌',
};

/** 官方计划详情（预览）：标题/说明/提醒配置清单 + 加入/已加入/退出状态 */
export function TemplatePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const online = useConnectionStore((s) => s.online);
  const [tpl, setTpl] = useState<PlanTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    socialApi
      .template(id) // #17/#21：离线读本地缓存（含 joined 状态）
      .then(setTpl)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const joined = tpl?.joined === true;

  const join = async () => {
    if (!tpl || joining) return;
    if (!online) {
      setNotice('当前未联网：加入官方计划需联网后使用');
      return;
    }
    setJoining(true);
    try {
      // #18：只保存到「我的计划」（不创建提醒）；开启开关在计划页
      await socialApi.joinTemplate(tpl.id);
      setNotice(`已把「${tpl.title}」保存到我的计划，可在计划页开启开关创建提醒`);
      void loadMe();
    } finally {
      setJoining(false);
    }
  };

  /** #21：退出官方计划（从我的计划移除 + 状态回退） */
  const leave = async () => {
    if (!tpl || joining) return;
    if (!online) {
      setNotice('当前未联网：退出官方计划需联网后使用');
      return;
    }
    setJoining(true);
    try {
      await socialApi.leaveTemplate(tpl.id);
      setNotice(`已退出「${tpl.title}」，从我的计划移除`);
      void loadMe();
    } finally {
      setJoining(false);
    }
  };

  const loadMe = async () => {
    if (!id) return;
    try {
      setTpl(await socialApi.template(id));
    } catch {
      /* 保持现状 */
    }
  };

  const configs = (tpl?.reminderConfig ?? []) as Array<{
    category?: string;
    title?: string;
    startTime?: string;
    content?: { text?: string; imageUrls?: string[] };
  }>;
  const heroMedia = (tpl?.mediaUrls ?? []).filter(Boolean);

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
            {notice && (
              <p className="rounded-btn bg-primary-50 px-3 py-2 text-[11px] font-medium text-primary-700">
                ✓ {notice}
              </p>
            )}
            <section className="rounded-card bg-surface p-5 text-center shadow-sm">
              {heroMedia.length > 0 ? (
                <MediaCarousel urls={heroMedia} aspect="aspect-[16/9]" className="mb-3" />
              ) : (
                <span className="text-3xl">🏛️</span>
              )}
              <h2 className="mt-2 flex items-center justify-center gap-1.5 text-lg font-semibold">
                {tpl.title}
                {joined && (
                  <span className="rounded-full bg-primary-500/15 px-2 py-0.5 text-[10px] font-medium text-primary-700">
                    ✓ 已加入
                  </span>
                )}
              </h2>
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
                        <p className="line-clamp-2 text-[11px] text-ink-500">
                          {c.startTime ? `每天 ${c.startTime}` : '每天（不定时）'}
                          {c.content?.text ? ` · ${c.content.text}` : ''}
                        </p>
                        {(c.content?.imageUrls?.length ?? 0) > 0 && (
                          <span className="mt-1 flex gap-1">
                            {c.content!.imageUrls!.slice(0, 4).map((u) => (
                              <img
                                key={u}
                                src={absoluteUrl(u)}
                                alt=""
                                loading="lazy"
                                className="h-10 w-10 rounded-md bg-bg object-cover"
                              />
                            ))}
                            {(c.content!.imageUrls?.length ?? 0) > 4 && (
                              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-ink-100 text-[10px] text-ink-500">
                                +{c.content!.imageUrls!.length - 4}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] text-primary-600">
                        {c.startTime ? '定时' : '不定时'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {joined ? (
              <button
                onClick={() => void leave()}
                disabled={joining || !online}
                className="flex w-full items-center justify-center gap-1 rounded-btn bg-danger-500/10 py-3 text-sm font-medium text-danger-600 disabled:opacity-50"
              >
                {joining ? '处理中…' : '退出计划（从我的计划移除）'}
              </button>
            ) : (
              <button
                onClick={() => void join()}
                disabled={joining || !online}
                className="flex w-full items-center justify-center gap-1 rounded-btn bg-primary-500 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                <Plus size={15} />
                {!online
                  ? '离线状态（需联网加入）'
                  : joining
                    ? '保存中…'
                    : '加入我的计划'}
              </button>
            )}
            <p className="px-1 text-[11px] text-ink-400">
              加入后计划保存到「我的计划」（不直接建提醒），在计划页开启开关即创建全部提醒；退出会连同计划提醒一并移除
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
