import { BottomNav } from '../components/BottomNav';

/**
 * P-18 设置（骨架）
 * M1 接入：通知偏好、时区；M5 接入：导出/注销
 */
export function SettingsPage() {
  return (
    <div className="mx-auto max-w-md pb-20">
      <header className="px-4 pt-6">
        <h1 className="text-xl font-semibold">设置</h1>
      </header>

      <main className="px-4">
        <div className="mt-4 rounded-card bg-surface p-8 text-center text-sm text-ink-300 shadow-sm">
          设置项（M1 接入）
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
