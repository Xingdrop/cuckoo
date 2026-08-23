import { ChevronRight, Pencil, Plus, Power, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
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
  return formatTime(r.nextTriggerAt);
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
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [planName, setPlanName] = useState('');
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

  const createPlan = async () => {
    if (!planName.trim()) return;
    try {
      await plansApi.create({ name: planName.trim() });
      setPlanName('');
      setCreatingPlan(false);
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

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
        <button
          onClick={() => navigate('/reminders/new')}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-500 text-white shadow-sm"
          aria-label="新建提醒"
        >
          <Plus size={22} />
        </button>
      </header>

      <main className="px-4 pt-4">
        {/* 快捷功能区（+ 号下方一排长块） */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => navigate('/medicines')}
            className="flex items-center gap-2.5 rounded-card bg-surface p-3.5 text-left shadow-sm"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-lg">💊</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">药物管理</span>
              <span className="block truncate text-[11px] text-ink-500">药品库存历史</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-ink-300" />
          </button>
          <button
            onClick={() => navigate('/water-settings')}
            className="flex items-center gap-2.5 rounded-card bg-surface p-3.5 text-left shadow-sm"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-lg">💧</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">喝水管理</span>
              <span className="block truncate text-[11px] text-ink-500">水量目标设置</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-ink-300" />
          </button>
          <button
            onClick={() => navigate('/exercises')}
            className="flex items-center gap-2.5 rounded-card bg-surface p-3.5 text-left shadow-sm"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-lg">🏃</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">锻炼库</span>
              <span className="block text-[11px] text-ink-500">50+ 微运动</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-ink-300" />
          </button>
          <button
            onClick={() => navigate('/pomodoro')}
            className="flex items-center gap-2.5 rounded-card bg-surface p-3.5 text-left shadow-sm"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-lg">🍅</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">番茄钟</span>
              <span className="block truncate text-[11px] text-ink-500">25+5 循环</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-ink-300" />
          </button>
        </div>

        {/* 我的计划（2026-08：自建/加入的计划 + 启停 + 发帖） */}
        <section className="mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-700">📋 我的计划</h2>
            <button
              onClick={() => setCreatingPlan((v) => !v)}
              className="flex h-9 items-center gap-0.5 rounded-full bg-primary-50 px-3 text-xs text-primary-600"
            >
              <Plus size={13} /> 新建计划
            </button>
          </div>
          {creatingPlan && (
            <div className="mt-2 flex gap-2">
              <input
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void createPlan()}
                maxLength={50}
                placeholder="计划名称，如：晨间习惯"
                className="min-w-0 flex-1 rounded-btn border border-ink-100 bg-surface px-3 py-2 text-sm outline-none focus:border-primary-400"
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
          {plans.length === 0 ? (
            <p className="mt-2 rounded-card bg-surface px-4 py-3 text-xs text-ink-500 shadow-sm">
              还没有计划——新建一个，或在社区一键加入朋友的计划
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {plans.map((p) => (
                <li key={p.id} className="rounded-card bg-surface px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {p.name}
                        {p.sourceType === 'self' ? (
                          <span className="ml-1.5 rounded-full bg-primary-50 px-1.5 py-0.5 text-[9px] text-primary-600">
                            自建
                          </span>
                        ) : (
                          <span className="ml-1.5 rounded-full bg-accent-100 px-1.5 py-0.5 text-[9px] text-accent-700">
                            {p.sourceType === 'official' ? '官方' : '加入'}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-500">
                        {p.reminderCount ?? 0} 条提醒
                        {p.sourceTitle ? ` · ${p.sourceTitle}` : ''}
                      </p>
                    </div>
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
                      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                        p.isActive ? 'bg-primary-500' : 'bg-ink-100'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                          p.isActive ? 'left-[18px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="mt-2 flex gap-2 border-t border-ink-100 pt-2">
                    <button
                      onClick={() => navigate(`/reminders/new?planId=${p.id}`)}
                      className="flex h-8 flex-1 items-center justify-center gap-0.5 rounded-btn bg-primary-50 text-[11px] font-medium text-primary-600"
                    >
                      <Plus size={12} /> 添加提醒
                    </button>
                    {p.sourceType === 'self' && (
                      <button
                        onClick={async () => {
                          try {
                            await plansApi.share(p.id);
                            setError(null);
                          } catch (e) {
                            setError(errorMessage(e));
                          }
                        }}
                        className="flex h-8 flex-1 items-center justify-center gap-0.5 rounded-btn bg-ink-100/60 text-[11px] font-medium text-ink-700"
                      >
                        <Send size={12} /> 一键发帖
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {toast && (
          <div className="mb-3 rounded-btn bg-primary-50 px-4 py-3 text-sm text-primary-700">
            ✅ 提醒已创建，下次触发：{formatFullTime(toast.nextTriggerAt)}
          </div>
        )}
        {error && (
          <p className="mb-3 rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{error}</p>
        )}
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
        ) : (
          <ul className="space-y-3">
            {items.map((r) => {
              const meta = CATEGORY_META[r.category];
              const icon = r.categoryIcon ?? meta.emoji;
              const label = r.category === 'custom' && r.categoryLabel ? r.categoryLabel : meta.label;
              void label; // 分类名暂用于 title 侧备注（M2 列表筛选增强）
              return (
                <li key={r.id} className="rounded-card bg-surface p-4 shadow-sm">
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
                        <p className="mt-0.5 text-[10px] text-primary-600">📋 来自计划：{r.planName}</p>
                      )}
                      {r.content.text && (
                        <p className="mt-0.5 truncate text-xs text-ink-500/70">{r.content.text}</p>
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
                      onClick={() => navigate(`/reminders/${r.id}/edit`)}
                      className="flex h-10 items-center justify-center gap-1 rounded-btn bg-primary-50 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-100"
                    >
                      <Pencil size={13} /> 编辑
                    </button>
                    <button
                      onClick={() => setDeleteTarget(r)}
                      className="flex h-10 items-center justify-center gap-1 rounded-btn bg-danger-500/10 text-xs font-medium text-danger-500 transition-colors hover:bg-danger-500/20"
                    >
                      <Trash2 size={13} /> 删除
                    </button>
                    <button
                      onClick={() => void toggleActive(r)}
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
