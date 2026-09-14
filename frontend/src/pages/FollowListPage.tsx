/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3BhZ2VzL0ZvbGxvd0xpc3RQYWdlLnRzeHwyMDI2LTA5fGE4YTUxYWU4N2M= */
import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorBanner, EmptyState, LoadingState } from '../components/ui/Feedback';
import { profileApi } from '../services/api/api.plans';
import { errorMessage } from '../services/http';
import { RImg } from '../components/remoteMedia';
import { useAuthStore } from '../stores/authStore';

/** 关注/粉丝列表（2026-08：个人主页数字入口） */
export function FollowListPage() {
  const { id } = useParams<{ id: string }>();
  const type = window.location.pathname.endsWith('/following') ? 'following' : 'followers';
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const targetId = id ?? me?.id;
  const [users, setUsers] = useState<{ id: string; username: string; avatarUrl: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetId) return;
    (type === 'following' ? profileApi.following(targetId) : profileApi.followers(targetId))
      .then(setUsers)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [targetId, type]);

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
        <h1 className="text-lg font-semibold">{type === 'following' ? '关注' : '粉丝'}</h1>
      </header>
      <main className="px-4 pt-3">
        <ErrorBanner message={error} />
        {loading ? (
          <LoadingState />
        ) : users.length === 0 ? (
          <EmptyState>{type === 'following' ? '还没有关注任何人' : '还没有粉丝'}</EmptyState>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => (
              <li key={u.id}>
                <button
                  onClick={() => navigate(`/profile/${u.id}`)}
                  className="flex w-full items-center gap-3 rounded-card bg-surface px-4 py-3 text-left shadow-sm"
                >
                  <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-sm font-semibold text-primary-600">
                    {u.avatarUrl ? (
                      <RImg src={u.avatarUrl} alt="头像" className="h-full w-full object-cover" />
                    ) : (
                      u.username.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="text-sm font-medium">@{u.username}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
