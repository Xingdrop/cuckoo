/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3BhZ2VzL0FjaGlldmVtZW50c1BhZ2UudHN4fDIwMjYtMDl8NDMxYTE2M2RiOA== */
import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorBanner, EmptyState, LoadingState } from '../components/ui/Feedback';
import { achievementsApi } from '../services/api/api.achievements';
import type { AchievementWall } from '../services/api/api.achievements';
import { errorMessage } from '../services/http';

/**
 * 成就墙（FR-708）：规则表驱动展示；达成后的分享入口（发帖 type=achievement）。
 */
export function AchievementsPage() {
  const navigate = useNavigate();
  const [wall, setWall] = useState<AchievementWall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    achievementsApi
      .wall()
      .then(setWall)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const share = async () => {
    if (!wall) return;
    const unlocked = wall.rules.filter((r) => r.achieved);
    if (unlocked.length === 0) return;
    setSharing(true);
    try {
      const { socialApi } = await import('../services/api/api.social');
      await socialApi.createPost({
        content: `🎉 我在布谷解锁了 ${unlocked.length} 个成就：${unlocked
          .slice(0, 3)
          .map((r) => `${r.icon}${r.name}`)
          .join('、')}${unlocked.length > 3 ? '…' : ''}，一起来坚持吧！`,
        type: 'achievement',
      });
      navigate('/social');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSharing(false);
    }
  };

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
        <h1 className="flex-1 text-lg font-semibold">成就墙</h1>
        {wall && wall.unlockedCount > 0 && (
          <button
            onClick={share}
            disabled={sharing}
            className="rounded-full bg-primary-500 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            分享成就
          </button>
        )}
      </header>

      <main className="px-4 pt-3">
        <ErrorBanner message={error} />
        {!wall && !error && <LoadingState />}
        {wall && (
          <div className="space-y-3">
            {/* 指标总览 */}
            <section className="grid grid-cols-3 gap-2">
              {[
                { label: '连续天数', value: `${wall.metrics.streakDays} 天` },
                { label: '用药完成', value: `${wall.metrics.medicationCount} 次` },
                { label: '喝水完成', value: `${wall.metrics.waterCount} 次` },
              ].map((m) => (
                <div key={m.label} className="rounded-card bg-surface p-3 text-center shadow-sm">
                  <p className="text-lg font-bold text-primary-600">{m.value}</p>
                  <p className="mt-0.5 text-[10px] text-ink-500">{m.label}</p>
                </div>
              ))}
            </section>

            {/* 规则列表 */}
            {wall.rules.length === 0 ? (
              <EmptyState>成就规则加载中…</EmptyState>
            ) : (
              wall.rules.map((r) => (
                <div
                  key={r.type}
                  className={`flex items-center gap-3 rounded-card bg-surface px-4 py-3.5 shadow-sm ${
                    r.achieved ? '' : 'opacity-80'
                  }`}
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${
                      r.achieved ? 'bg-accent-100' : 'bg-ink-100 grayscale'
                    }`}
                  >
                    {r.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {r.name}
                      {r.achieved && <span className="ml-1.5 text-xs text-primary-600">✓ 已获得</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">{r.description}</p>
                    {!r.achieved && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                          <div
                            className="h-full rounded-full bg-primary-400"
                            style={{ width: `${Math.min(100, (r.current / r.threshold) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-ink-500">
                          {r.current}/{r.threshold}
                          {r.unit}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
