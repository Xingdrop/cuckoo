import { Compass } from 'lucide-react';
import { BottomNav } from '../components/BottomNav';

/**
 * P-11 社区首页（骨架）
 * M4 接入：帖子流、官方计划入口、一键加入计划
 */
export function SocialPage() {
  return (
    <div className="mx-auto max-w-md pb-20">
      <header className="px-4 pt-6">
        <h1 className="text-xl font-semibold">社交</h1>
        <p className="mt-1 text-sm text-ink-500">分享计划，和伙伴一起坚持</p>
      </header>

      <main className="px-4">
        <div className="mt-4 flex flex-col items-center rounded-card bg-surface p-10 text-ink-300 shadow-sm">
          <Compass size={36} strokeWidth={1.2} />
          <p className="mt-3 text-sm">社区建设中（M4 里程碑接入）</p>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
