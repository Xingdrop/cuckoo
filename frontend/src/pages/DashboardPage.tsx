import { Plus, TrendingUp } from 'lucide-react';
import { BottomNav } from '../components/BottomNav';

/**
 * P-03 今日看板（骨架）
 * M1 接入真实数据：今日概览环形图、连续天数、今日提醒时间轴
 */
export function DashboardPage() {
  return (
    <div className="mx-auto max-w-md pb-20">
      <header className="px-4 pt-6">
        <h1 className="text-xl font-semibold">今日</h1>
        <p className="mt-1 text-sm text-ink-500">准时提醒，温柔守护</p>
      </header>

      <main className="px-4">
        {/* 完成率卡片（M1 接入数据） */}
        <section className="mt-4 rounded-card bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-ink-500">今日完成率</p>
              <p className="mt-1 text-3xl font-bold text-primary-600">--%</p>
              <p className="mt-1 text-xs text-ink-300">0 / 0 已完成</p>
            </div>
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-50 text-primary-500">
              <TrendingUp size={32} strokeWidth={1.5} />
            </div>
          </div>
        </section>

        {/* 今日提醒时间轴（M1 接入数据） */}
        <section className="mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">今日提醒</h2>
            <button className="flex items-center gap-1 text-sm text-primary-600">
              <Plus size={16} /> 新建
            </button>
          </div>
          <div className="mt-3 rounded-card bg-surface p-8 text-center text-sm text-ink-300 shadow-sm">
            暂无提醒，点击右上角新建
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
