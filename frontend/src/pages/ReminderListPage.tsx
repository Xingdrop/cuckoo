import { ChevronRight, Pencil, Plus, Power, Settings2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { ConfirmModal } from '../components/ConfirmModal';
import { errorMessage } from '../services/http';
import { remindersApi } from '../services/api/api.reminders';
import { plansApi } from '../services/api/api.plans';
import type { Plan } from '../services/api/api.plans';
import type { Reminder, ReminderCategory } from '../types';

const CATEGORY_META: Record<ReminderCategory, { label: string; emoji: string }> = {
  medication: { label: '吃药', emoji: '💊' },
  exercise: { label: '锻炼', emoji: '🏃' },
  water: { label: '喝水', emoji: '💧' },
  rest: { label: '休息', emoji: '😴' },
  work: { label: '工作', emoji: '💼' },
  custom: { label: '自定义', emoji: '📌' },
};

function formatRepeat(rule: Reminder['repeatRule']): string {
  switch (rule.type) {
    case 'once':
      return '单次';
    case 'daily':
      return '每天';
    case 'weekly':
      return `每周 ${(rule.daysOfWeek ?? []).map((d) => '日一二三四五六'[d]).join('、')}`;
    case 'monthly':
      return `每月 ${rule.dayOfMonth} 日`;
    case 'interval':
      return `每 ${rule.intervalValue} ${rule.intervalUnit === 'hour' ? '小时' : rule.intervalUnit === 'week' ? '周' : '天'}`;
    default:
      return '';
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatReminderTime(r: Reminder): string {
  // 不定时每日提醒：不显示具体时间
  if (r.repeatRule?.type === 'daily' && (!r.times || r.times.length === 0)) return '不定时';
  const t = formatTime(r.nextTriggerAt);
  if (t !== '—') return t;
  // #25：本地/种子数据无 nextTriggerAt → 从规则推导显示（否则列表时间栏空白）
  const times = r.times?.length ? r.times : null;
  if (times) return times.length === 1 ? times[0] : `${times[0]} 起 ${times.length} 次`;
  const rr = r.repeatRule;
  if (rr?.type === 'interval') {
    const unit = (rr.intervalUnit as string) === 'minute' ? '分钟' : rr.intervalUnit === 'week' ? '周' : '小时';
    return `每 ${rr.intervalValue ?? 1} ${unit}`;
  }
  return '—';
}

function formatFullTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${formatTime(iso)}`;
}

/**
 * P-04 提醒列表（FR-201/209）
 * 按 nextTriggerAt 排序，支持启停/删除/编辑
 */
export function ReminderListPage() {
  const [items, setItems] = useState<Reminder[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Record<ReminderCategory, boolean>>(() => {
    try {
      const raw = localStorage.getItem('cuckoo_reminder_filter');
      if (raw) return JSON.parse(raw) as Record<ReminderCategory, boolean>;
    } catch {
      /* 忽略 */
    }
    return { medication: true, exercise: true, water: true, rest: true, work: true, custom: true };
  });
  const navigate = useNavigate();
  const location = useLocation();
  const created = (location.state as { created?: Reminder } | null)?.created;

  // 创建成功提示（缓存到本地 state，避免 replace 后丢失）
  const [toast, setToast] = useState<Reminder | null>(null);
  useEffect(() => {
    if (created) {
      setToast(created);
      navigate('.', { replace: true, state: {} });
    }
  }, [created, navigate]);

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([remindersApi.list(), plansApi.list()]);
      setItems(r);
      setPlans(p);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilter = (next: Record<ReminderCategory, boolean>) => {
    setFilters(next);
    localStorage.setItem('cuckoo_reminder_filter', JSON.stringify(next));
  };

  const visibleItems = items.filter((r) => filters[r.category] ?? true);

  const toggleActive = async (r: Reminder) => {
    const updated = await remindersApi.setActive(r.id, !r.isActive);
    setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    window.dispatchEvent(new CustomEvent('cuckoo:reminders-changed'));
  };

  const remove = async () => {
    if (!deleteTarget) return;
    await remindersApi.remove(deleteTarget.id);
    setItems((prev) => prev.filter((x) => x.id !== deleteTarget.id));
    setDeleteTarget(null);
    window.dispatchEvent(new CustomEvent('cuckoo:reminders-changed'));
  };

  return (
    <div className="mx-auto max-w-md pb-20">
      <header className="flex items-center justify-between px-4 pt-6">
        <div>
          <h1 className="text-xl font-semibold">提醒</h1>
          <p className="mt-1 text-sm text-ink-500">管理你的所有计划</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink-700 shadow-sm"
            aria-label="显示设置（选择分类）"
          >
            <Settings2 size={19} />
          </button>
          <button
            onClick={() => navigate('/reminders/new')}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-500 text-white shadow-sm"
            aria-label="新建提醒"
          >
            <Plus size={22} />
          </button>
        </div>
      </header>

      {/* 显示设置弹窗（#4：选择是否显示药物等分类） */}
      {filterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8">
          <div className="w-full max-w-xs rounded-card bg-surface p-5 shadow-xl">
            <h3 className="text-base font-semibold">显示设置</h3>
            <p className="mt-1 text-[11px] text-ink-500">选择提醒列表中要显示的分类</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(Object.keys(CATEGORY_META) as ReminderCategory[]).map((c) => (
                <button
                  key={c}
                  onClick={() => applyFilter({ ...filters, [c]: !filters[c] })}
                  className={`flex items-center gap-2 rounded-btn px-3 py-2 text-sm ${
                    filters[c] ? 'bg-primary-50 text-primary-700' : 'bg-ink-100/60 text-ink-500'
                  }`}
                >
                  <span>{CATEGORY_META[c].emoji}</span>
                  <span className="flex-1 text-left">{CATEGORY_META[c].label}</span>
                  <span>{filters[c] ? '✓' : ''}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setFilterOpen(false)}
              className="mt-4 w-full rounded-btn bg-primary-500 py-3 text-sm font-medium text-white"
            >
              完成
            </button>
          </div>
        </div>
      )}

      <main className="px-4 pt-4">
        {toast && (
          <div className="mb-3 rounded-btn bg-primary-50 px-4 py-3 text-sm text-primary-700">
            ✅ 提醒已创建，下次触发：{formatFullTime(toast.nextTriggerAt)}
          </div>
        )}
        {error && (
          <p className="mb-3 rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{error}</p>
        )}

        {/* 通用折叠分区：服务与管理（含我的计划入口 #5） */}
        <CollapsibleSection id="manage" icon="🧰" title="服务与管理">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => navigate('/medicines')}
              className="flex items-center gap-2 rounded-card bg-surface p-3 text-left shadow-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-base">💊</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-snug">药物管理</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-ink-500">药品库存历史</span>
              </span>
            </button>
            <button
              onClick={() => navigate('/water-settings')}
              className="flex items-center gap-2 rounded-card bg-surface p-3 text-left shadow-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-base">💧</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-snug">喝水管理</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-ink-500">水量目标设置</span>
              </span>
            </button>
            <button
              onClick={() => navigate('/exercises')}
              className="flex items-center gap-2 rounded-card bg-surface p-3 text-left shadow-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-base">🏃</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-snug">锻炼库</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-ink-500">跟练图解微运动</span>
              </span>
            </button>
            <button
              onClick={() => navigate('/pomodoro')}
              className="flex items-center gap-2 rounded-card bg-surface p-3 text-left shadow-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-base">🍅</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-snug">番茄钟</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-ink-500">专注休息循环</span>
              </span>
            </button>
          </div>
          {/* 我的计划（#5：并入服务与管理） */}
          <button
            onClick={() => navigate('/plans')}
            className="mt-2 flex w-full items-center gap-3 rounded-card bg-surface px-4 py-3.5 text-left shadow-sm"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-lg">
              📋
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">我的计划</span>
              <span className="block text-[11px] text-ink-500">
                {plans.length > 0 ? `${plans.length} 个计划 · 新建/启停/发帖/删除` : '新建计划，或加入朋友的计划'}
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-ink-300" />
          </button>
        </CollapsibleSection>

        {/* 通用折叠分区：全部提醒 */}
        <CollapsibleSection id="reminders" icon="📌" title="全部提醒" badge={`（${items.length}）`}>
        {loading ? (
          <div className="py-16 text-center text-sm text-ink-500">加载中…</div>
        ) : items.length === 0 ? (
          <div className="rounded-card bg-surface p-10 text-center text-sm text-ink-300 shadow-sm">
            暂无提醒
            <button
              onClick={() => navigate('/reminders/new')}
              className="mt-3 block w-full rounded-btn bg-primary-500 py-3 text-sm font-medium text-white"
            >
              创建第一个提醒
            </button>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="rounded-card bg-surface p-10 text-center text-sm text-ink-300 shadow-sm">
            当前筛选下没有提醒（点右上角 ⚙ 恢复分类显示）
          </div>
        ) : (
          <ul className="space-y-3">
              {visibleItems.map((r) => {
                const meta = CATEGORY_META[r.category];
                const icon = r.categoryIcon ?? meta.emoji;
                const label = r.category === 'custom' && r.categoryLabel ? r.categoryLabel : meta.label;
                void label; // 分类名暂用于 title 侧备注（M2 列表筛选增强）
                return (
                  <li
                    key={r.id}
                    className="cursor-pointer rounded-card bg-surface p-4 shadow-sm"
                    onClick={() => navigate(`/reminders/${r.id}/edit`)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-lg">
                        {icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium ${r.isActive ? '' : 'text-ink-300'}`}>
                          {r.title}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {formatRepeat(r.repeatRule)} · {formatReminderTime(r)}
                        </p>
                        {r.planName && (
                          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-primary-600">
                            📋 来自计划：{r.planName}
                            {r.modifiedFromPlan && (
                              <span className="rounded-full bg-accent-100 px-1.5 py-0.5 text-[9px] text-accent-700">
                                已修改
                              </span>
                            )}
                          </p>
                        )}
                        {r.content.text && (
                          <p className="mt-0.5 truncate text-xs text-ink-500/70">{r.content.text}</p>
                        )}
                        {((r.content.imageUrls?.length ?? 0) > 0 || r.content.videoUrl) && (
                          <p className="mt-0.5 text-[10px] text-ink-400">
                            {r.content.videoUrl ? '🎬 视频' : ''}
                            {(r.content.imageUrls?.length ?? 0) > 0 ? `🖼 ${r.content.imageUrls!.length} 图` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] ${
                            r.isActive
                              ? 'bg-primary-50 text-primary-600'
                              : 'bg-ink-100 text-ink-500'
                          }`}
                        >
                          {r.isActive ? '● 启用中' : '○ 已停用'}
                        </span>
                        <span
                          className={`text-lg font-semibold ${r.isActive ? 'text-primary-600' : 'text-ink-300'}`}
                        >
                          {formatReminderTime(r)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-ink-100 pt-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/reminders/${r.id}/edit`);
                        }}
                        className="flex h-10 items-center justify-center gap-1 rounded-btn bg-primary-50 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-100"
                      >
                        <Pencil size={13} /> 编辑
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(r);
                        }}
                        className="flex h-10 items-center justify-center gap-1 rounded-btn bg-danger-500/10 text-xs font-medium text-danger-500 transition-colors hover:bg-danger-500/20"
                      >
                        <Trash2 size={13} /> 删除
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleActive(r);
                        }}
                        className={`flex h-10 items-center justify-center gap-1 rounded-btn text-xs font-medium transition-colors ${
                          r.isActive
                            ? 'bg-ink-100/70 text-ink-700 hover:bg-ink-100'
                            : 'bg-primary-500/10 text-primary-600 hover:bg-primary-500/20'
                        }`}
                      >
                        <Power size={13} /> {r.isActive ? '停用' : '启用'}
                      </button>
                    </div>
                  </li>
                );
              })}
              </ul>
        )}
        </CollapsibleSection>
      </main>

      {/* 删除确认弹窗 */}
      <ConfirmModal
        open={deleteTarget !== null}
        title="删除提醒"
        message={`确定删除「${deleteTarget?.title ?? ''}」吗？删除后无法恢复。`}
        onConfirm={() => void remove()}
        onCancel={() => setDeleteTarget(null)}
      />

      <BottomNav />
    </div>
  );
}
