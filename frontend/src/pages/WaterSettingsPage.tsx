import { ChevronLeft, Droplets, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../services/http';
import { remindersApi } from '../services/api/api.reminders';
import { statsApi } from '../services/api/api.stats';
import { authApi } from '../services/api/api.auth';
import type { Reminder } from '../types';

/**
 * 喝水管理页（FR-501/403）
 * 专注喝水：提醒开关 + 每次水量 + 每日目标 + 新建提醒按钮
 */
export function WaterSettingsPage() {
  const navigate = useNavigate();
  const [waterReminder, setWaterReminder] = useState<Reminder | null>(null);
  const [waterAmount, setWaterAmount] = useState(200);
  const [waterGoal, setWaterGoal] = useState(2000);
  const [todayMl, setTodayMl] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [reminders, dashboard, settings] = await Promise.all([
        remindersApi.list({ isActive: undefined }),
        statsApi.dashboard(),
        authApi.getSettings(),
      ]);
      const water = reminders.find((r) => r.category === 'water') ?? null;
      setWaterReminder(water);
      const wa = (water?.content as { waterAmountMl?: number } | undefined)?.waterAmountMl;
      if (wa) setWaterAmount(wa);
      setWaterGoal(settings.waterGoalMl);
      setTodayMl(dashboard.water.waterMl);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 保存每次水量 */
  const saveAmount = async () => {
    if (!waterReminder) return;
    setError(null);
    try {
      const updated = await remindersApi.update(waterReminder.id, {
        content: {
          ...waterReminder.content,
          text: waterReminder.content.text,
          waterAmountMl: waterAmount,
        },
      });
      setWaterReminder(updated);
      window.dispatchEvent(new CustomEvent('cuckoo:reminders-changed'));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  /** 保存每日目标 */
  const saveGoal = async () => {
    setError(null);
    try {
      await authApi.updateSettings({ waterGoalMl: waterGoal });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const inputCls =
    'w-full rounded-btn border border-ink-100 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary-400';

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
          <h1 className="text-lg font-semibold">喝水管理</h1>
          <p className="text-xs text-ink-500">今日已喝 {todayMl} / {waterGoal}ml</p>
        </div>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {error && (
          <p className="rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{error}</p>
        )}

        {/* 今日进度 */}
        <section className="rounded-card bg-primary-500 p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70">今日喝水进度</p>
              <p className="mt-1 text-3xl font-bold">
                {todayMl}
                <span className="ml-1 text-base font-normal text-white/70">/ {waterGoal}ml</span>
              </p>
            </div>
            <Droplets size={40} className="text-white/40" strokeWidth={1.2} />
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${Math.min(100, Math.round((todayMl / Math.max(1, waterGoal)) * 100))}%` }}
            />
          </div>
        </section>

        {/* #26：喝水提醒开关已移除——喝水提醒在「提醒列表 → 新建」中创建；完成率可在今日页面板勾选 */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <p className="text-sm font-medium">说明</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            喝水提醒请在「提醒页 → 新建提醒（分类：喝水）」中创建与启停；无需喝水提醒也能记录水量，
            并可在今日页「完成率 → 选择计入提醒」中把「喝水（当日达标）」计入完成率。
          </p>
        </section>

          {/* 水量与目标 */}
          <section className="rounded-card bg-surface p-4 shadow-sm">
            <p className="text-sm font-medium">设置</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-ink-700">每次喝水量</label>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="number"
                  min={50}
                  max={1000}
                  step={50}
                  value={waterAmount}
                  disabled={!waterReminder}
                  onChange={(e) => setWaterAmount(Number(e.target.value) || 200)}
                  className={inputCls}
                />
                <span className="text-xs text-ink-500">ml</span>
              </div>
              <button
                onClick={saveAmount}
                disabled={!waterReminder}
                className="mt-2 w-full rounded-btn bg-primary-50 py-2 text-xs font-medium text-primary-600 disabled:opacity-50"
              >
                保存水量
              </button>
            </div>
            <div>
              <label className="text-sm text-ink-700">每日目标</label>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="number"
                  min={500}
                  max={5000}
                  step={100}
                  value={waterGoal}
                  onChange={(e) => setWaterGoal(Number(e.target.value) || 2000)}
                  className={inputCls}
                />
                <span className="text-xs text-ink-500">ml</span>
              </div>
              <button
                onClick={saveGoal}
                className="mt-2 w-full rounded-btn bg-primary-50 py-2 text-xs font-medium text-primary-600"
              >
                保存目标
              </button>
            </div>
          </div>
        </section>

        {/* 新建提醒 */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <p className="text-sm font-medium">提醒计划</p>
          <p className="mt-1 text-xs text-ink-500">
            {waterReminder
              ? '已有喝水提醒，可新建更多时间点或调整计划'
              : '还没有喝水提醒，创建一个吧'}
          </p>
          <button
            onClick={() =>
              navigate('/reminders/new', { state: { preset: { category: 'water' } } })
            }
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-btn bg-primary-500 py-3 text-sm font-medium text-white"
          >
            <Plus size={16} /> 新建喝水提醒
          </button>
        </section>
      </main>
    </div>
  );
}
