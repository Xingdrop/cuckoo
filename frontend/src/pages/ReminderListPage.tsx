import { ChevronRight, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { errorMessage } from '../services/http';
import { remindersApi } from '../services/api/api.reminders';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      setItems(await remindersApi.list());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (r: Reminder) => {
    const updated = await remindersApi.setActive(r.id, !r.isActive);
    setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    window.dispatchEvent(new CustomEvent('cuckoo:reminders-changed'));
  };

  const remove = async (r: Reminder) => {
    if (!window.confirm(`删除提醒「${r.title}」？`)) return;
    await remindersApi.remove(r.id);
    setItems((prev) => prev.filter((x) => x.id !== r.id));
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
              <span className="block text-[11px] text-ink-500">药品/库存/历史</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-ink-300" />
          </button>
          <button
            onClick={() => navigate('/reminders/new', { state: { preset: { category: 'water' } } })}
            className="flex items-center gap-2.5 rounded-card bg-surface p-3.5 text-left shadow-sm"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-lg">💧</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">喝水提醒</span>
              <span className="block text-[11px] text-ink-500">水量/目标/提醒</span>
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
              <span className="block text-[11px] text-ink-500">25+5 专注循环</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-ink-300" />
          </button>
        </div>
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
                        {formatRepeat(r.repeatRule)} · {formatTime(r.nextTriggerAt)}
                      </p>
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
                        {formatTime(r.nextTriggerAt)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1 border-t border-ink-100 pt-2">
                    <button
                      onClick={() => navigate(`/reminders/${r.id}/edit`)}
                      className="flex h-11 min-w-16 items-center justify-center gap-1 rounded-md px-3 text-xs text-ink-700"
                    >
                      <Pencil size={14} /> 编辑
                    </button>
                    <button
                      onClick={() => remove(r)}
                      className="flex h-11 min-w-16 items-center justify-center gap-1 rounded-md px-3 text-xs text-danger-500"
                    >
                      <Trash2 size={14} /> 删除
                    </button>
                    <button
                      onClick={() => toggleActive(r)}
                      className={`flex h-11 min-w-16 items-center justify-center gap-1 rounded-md px-3 text-xs ${
                        r.isActive ? 'text-ink-700' : 'text-primary-600'
                      }`}
                    >
                      <Power size={14} /> {r.isActive ? '停用' : '启用'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
