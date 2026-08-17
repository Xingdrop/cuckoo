import { BottomNav } from '../components/BottomNav';

/**
 * P-04 提醒列表（骨架）
 * M1 接入真实数据：按时间/分类筛选、启停开关
 */
export function ReminderListPage() {
  return (
    <div className="mx-auto max-w-md pb-20">
      <header className="px-4 pt-6">
        <h1 className="text-xl font-semibold">提醒</h1>
        <p className="mt-1 text-sm text-ink-500">管理你的所有计划</p>
      </header>

      <main className="px-4">
        <div className="mt-4 rounded-card bg-surface p-8 text-center text-sm text-ink-300 shadow-sm">
          暂无提醒（M1 接入）
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
