import { ChevronDown, ChevronLeft, GripVertical, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGuestStore } from '../guest/guestStore';
import { useConnectionStore } from '../stores/connectionStore';
import { BottomNav } from '../components/BottomNav';
import { ConfirmModal } from '../components/ConfirmModal';
import { ErrorBanner, EmptyState, LoadingState } from '../components/ui/Feedback';
import { errorMessage } from '../services/http';
import { plansApi } from '../services/api/api.plans';
import type { Plan } from '../services/api/api.plans';
import { remindersApi } from '../services/api/api.reminders';
import { socialApi } from '../services/api/api.social';
import type { Reminder } from '../types';

/**
 * 我的计划主页（2026-08：#7 独立页而非内联展开）。
 * 列表 / 新建 / 启停（美化开关）/ 展开明细 / 添加提醒 / 删除计划 / 一键发帖（自定义文字 #9）。
 */
export function PlansPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const guestActive = useGuestStore((s) => s.active);
  const online = useConnectionStore((s) => s.online);
  const [planName, setPlanName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sharePlan, setSharePlan] = useState<Plan | null>(null);
  const [shareText, setShareText] = useState('');
  const [deletePlan, setDeletePlan] = useState<Plan | null>(null);
  const [renamePlan, setRenamePlan] = useState<Plan | null>(null);
  const [renameText, setRenameText] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const [order, setOrder] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cuckoo_plan_order') ?? '[]') as string[];
    } catch {
      return [];
    }
  });

  /** 拖拽排序（#4c：本地持久化；新计划追加到末尾） */
  const orderedPlans = useMemo(() => {
    const map = new Map(plans.map((p) => [p.id, p]));
    const ids = order.filter((id) => map.has(id));
    const rest = plans.filter((p) => !ids.includes(p.id));
    return [...ids.map((id) => map.get(id)!).filter(Boolean), ...rest];
  }, [plans, order]);

  const move = (from: string, to: string) => {
    const ids = orderedPlans.map((p) => p.id);
    const fi = ids.indexOf(from);
    const ti = ids.indexOf(to);
    if (fi < 0 || ti < 0) return;
    ids.splice(ti, 0, ids.splice(fi, 1)[0]);
    setOrder(ids);
    localStorage.setItem('cuckoo_plan_order', JSON.stringify(ids));
  };

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([plansApi.list(), remindersApi.list()]);
      setPlans(p);
      setReminders(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createPlan = async () => {
    if (!planName.trim()) return;
    try {
      await plansApi.create({ name: planName.trim() });
      setPlanName('');
      setCreating(false);
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const share = async () => {
    if (!sharePlan) return;
    if (!online) {
      setError('当前未联网：一键发帖需联网后使用');
      return;
    }
    try {
      const snapshot = await plansApi.snapshot(sharePlan.id);
      const from = (snapshot as { from?: { name?: string } }).from;
      await socialApi.createPost({
        content: shareText.trim() || `📋 我的计划「${from?.name ?? sharePlan.name}」：欢迎一键加入一起坚持！`,
        type: 'user_plan',
        planSnapshot: snapshot,
      });
      setSharePlan(null);
      setShareText('');
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const sourceLabel = (p: Plan) =>
    p.sourceType === 'self' ? '自建' : p.sourceType === 'official' ? '官方计划' : '加入的计划';

  return (
    <div className="mx-auto max-w-md pb-20">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-bg/95 px-4 py-3 backdrop-blur">
        <button
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center text-ink-700"
          aria-label="返回"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="flex-1 text-lg font-semibold">我的计划</h1>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex h-9 items-center gap-1 rounded-full bg-primary-500 px-3.5 text-xs font-medium text-white"
        >
          <Plus size={14} /> 新建计划
        </button>
      </header>

      <main className="px-4 pt-3">
        {guestActive && (
          <p className="mb-3 rounded-btn bg-accent-100/60 px-3 py-2 text-[11px] text-accent-700">
            🎒 游客模式：计划数据仅存本机，可新建/管理；「一键发帖」需联网登录后使用（2026-08 #17）
          </p>
        )}
        {!guestActive && !online && (
          <p className="mb-3 rounded-btn bg-warning-500/15 px-3 py-2 text-[11px] text-ink-700">
            📡 离线模式：计划数据存本机，可新建/管理；「一键发帖」需联网后使用
          </p>
        )}
        <ErrorBanner message={error} />

        {creating && (
          <div className="mb-3 flex gap-2 rounded-card bg-surface p-3 shadow-sm">
            <input
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createPlan()}
              maxLength={50}
              placeholder="计划名称，如：晨间习惯"
              className="min-w-0 flex-1 rounded-btn border border-ink-100 bg-bg px-3 py-2 text-sm outline-none focus:border-primary-400"
            />
            <button
              onClick={() => void createPlan()}
              disabled={!planName.trim()}
              className="rounded-btn bg-primary-500 px-4 text-xs font-medium text-white disabled:opacity-50"
            >
              创建
            </button>
          </div>
        )}

        {loading ? (
          <LoadingState />
        ) : plans.length === 0 ? (
          <EmptyState>还没有计划——新建一个，或在社区一键加入朋友的计划</EmptyState>
        ) : (
          <ul className="space-y-3">
            {orderedPlans.map((p) => {
              const planReminders = reminders.filter((r) => r.planId === p.id);
              const isOpen = expanded === p.id;
              return (
                <li
                  key={p.id}
                  draggable
                  onDragStart={() => setDragId(p.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    // #4：经过目标行时实时让位（防抖：仅当 hover 变化时移动一次）
                    if (dragId && dragId !== p.id && hoverRef.current !== p.id) {
                      hoverRef.current = p.id;
                      move(dragId, p.id);
                    }
                  }}
                  onDrop={() => {
                    hoverRef.current = null;
                    setDragId(null);
                  }}
                  onDragEnd={() => {
                    hoverRef.current = null;
                    setDragId(null);
                  }}
                  className={`rounded-card bg-surface p-4 shadow-sm transition-all duration-150 ${
                    dragId === p.id
                      ? 'opacity-60 ring-2 ring-primary-400'
                      : hoverRef.current === p.id
                        ? 'ring-2 ring-primary-200'
                        : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="shrink-0 cursor-grab text-ink-300 active:cursor-grabbing"
                      title="拖动排序"
                    >
                      <GripVertical size={16} />
                    </span>
                    <button
                      onClick={() => setExpanded(isOpen ? null : p.id)}
                      className="min-w-0 flex-1 text-left"
                      aria-expanded={isOpen}
                    >
                      <p className="flex items-center gap-1 truncate text-sm font-medium">
                        <ChevronDown
                          size={13}
                          className={`shrink-0 text-ink-300 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                        <span className="truncate">{p.name}</span>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] ${
                            p.sourceType === 'self' ? 'bg-primary-50 text-primary-600' : 'bg-accent-100 text-accent-700'
                          }`}
                        >
                          {sourceLabel(p)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-500">
                        {!p.isActive && (p.reminderCount ?? 0) > 0
                          ? '已停用（提醒暂停）'
                          : (p.reminderCount ?? 0) > 0
                            ? `${p.reminderCount} 条提醒`
                            : (p.configCount ?? 0) > 0
                              ? `已保存（共 ${p.configCount} 条，开启开关后创建提醒）`
                              : '还没有提醒'}
                        {p.sourceTitle ? ` · ${p.sourceTitle}` : ''}
                      </p>
                    </button>
                    {/* 简洁通用开关（v3：flex + justify 切换——滑块走 flow 布局，任何浏览器/缩放必然对齐） */}
                    <button
                      onClick={async () => {
                        try {
                          await plansApi.patch(p.id, { isActive: !p.isActive });
                          void load();
                        } catch (e) {
                          setError(errorMessage(e));
                        }
                      }}
                      aria-label={p.isActive ? '停用计划' : '启用计划'}
                      className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ${
                        p.isActive ? 'justify-end bg-primary-500' : 'justify-start bg-ink-100'
                      }`}
                    >
                      <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
                    </button>
                  </div>

                  {/* 展开明细 */}
                  {isOpen && (
                    <ul className="mt-2 space-y-1.5 rounded-btn bg-bg px-3 py-2">
                      {planReminders.length === 0 ? (
                        <li className="py-1 text-center text-[11px] text-ink-300">该计划还没有提醒</li>
                      ) : (
                        planReminders.map((r) => (
                          <li key={r.id} className="flex items-center gap-2 text-xs">
                            <span className="text-primary-600">{r.categoryIcon ?? ['💊', '🏃', '💧', '😴', '💼', '📌'][['medication', 'exercise', 'water', 'rest', 'work', 'custom'].indexOf(r.category)] ?? '📌'}</span>
                            <span className="min-w-0 flex-1 truncate">{r.title}</span>
                            {r.modifiedFromPlan && (
                              <span className="shrink-0 rounded-full bg-accent-100 px-1.5 py-0.5 text-[9px] text-accent-700">已修改</span>
                            )}
                            <button
                              onClick={() => navigate(`/reminders/${r.id}/edit`)}
                              className="shrink-0 text-primary-600"
                              aria-label="编辑提醒"
                            >
                              <Pencil size={12} />
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}

                  <div className="mt-2 flex gap-2 border-t border-ink-100 pt-2">
                    <button
                      onClick={() => navigate(`/reminders/new?planId=${p.id}`)}
                      className="flex h-8 flex-1 items-center justify-center gap-0.5 rounded-btn bg-primary-50 text-[11px] font-medium text-primary-600"
                    >
                      <Plus size={12} /> 添加提醒
                    </button>
                    <button
                      onClick={() => {
                        setSharePlan(p);
                        setShareText(`📋 我的计划「${p.name}」：${p.reminderCount ?? 0} 条提醒，欢迎一键加入一起坚持！`);
                      }}
                      disabled={(p.reminderCount ?? 0) === 0 || !online}
                      title={
                        !online
                          ? '一键发帖需联网后使用'
                          : (p.reminderCount ?? 0) === 0
                            ? '先添加提醒才能发帖'
                            : undefined
                      }
                      className="flex h-8 flex-1 items-center justify-center gap-0.5 rounded-btn bg-ink-100/60 text-[11px] font-medium text-ink-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Send size={12} /> 一键发帖
                    </button>
                    <button
                      onClick={() => {
                        setRenamePlan(p);
                        setRenameText(p.name);
                      }}
                      className="flex h-8 w-9 items-center justify-center rounded-btn bg-ink-100/60 text-ink-700"
                      aria-label="重命名计划"
                      title="重命名"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDeletePlan(p)}
                      className="flex h-8 w-9 items-center justify-center rounded-btn bg-danger-500/10 text-danger-500"
                      aria-label="删除计划"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {/* 一键发帖弹窗（自定义文案） */}
      {sharePlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8">
          <div className="w-full max-w-sm rounded-card bg-surface p-5 shadow-xl">
            <h3 className="text-base font-semibold">发布计划帖</h3>
            <p className="mt-1 text-[11px] text-ink-500">将「{sharePlan.name}」作为可一键加入的计划发布到广场</p>
            <textarea
              value={shareText}
              onChange={(e) => setShareText(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="写点介绍（可选，留空使用默认文案）…"
              className="mt-3 w-full resize-none rounded-btn border border-ink-100 p-3 text-sm outline-none focus:border-primary-400"
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setSharePlan(null)}
                className="flex-1 rounded-btn bg-ink-100 py-3 text-sm font-medium text-ink-700"
              >
                取消
              </button>
              <button
                onClick={() => void share()}
                className="flex-1 rounded-btn bg-primary-500 py-3 text-sm font-medium text-white"
              >
                发布
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重命名弹窗（#9） */}
      {renamePlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8">
          <div className="w-full max-w-xs rounded-card bg-surface p-5 shadow-xl">
            <h3 className="text-base font-semibold">重命名计划</h3>
            <input
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              maxLength={50}
              autoFocus
              className="mt-3 w-full rounded-btn border border-ink-100 px-3 py-2.5 text-sm outline-none focus:border-primary-400"
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setRenamePlan(null)}
                className="flex-1 rounded-btn bg-ink-100 py-3 text-sm font-medium text-ink-700"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  try {
                    await plansApi.patch(renamePlan.id, { name: renameText.trim() });
                    setRenamePlan(null);
                    void load();
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
                disabled={!renameText.trim()}
                className="flex-1 rounded-btn bg-primary-500 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      <ConfirmModal
        open={deletePlan !== null}
        title="删除计划"
        message={`确定删除计划「${deletePlan?.name ?? ''}」吗？计划下的全部提醒将一并删除（可通过再次加入/重新创建恢复）。`}
        onConfirm={async () => {
          if (!deletePlan) return;
          try {
            await plansApi.remove(deletePlan.id);
            setDeletePlan(null);
            void load();
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
        onCancel={() => setDeletePlan(null)}
      />

      <BottomNav />
    </div>
  );
}
