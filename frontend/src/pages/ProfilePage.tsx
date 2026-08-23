import { ChevronLeft, Settings, UserPlus, Check } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorBanner, LoadingState } from '../components/ui/Feedback';
import { profileApi } from '../services/api/api.plans';
import type { ProfileView } from '../services/api/api.plans';
import { errorMessage } from '../services/http';
import { useAuthStore } from '../stores/authStore';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
}

/**
 * 个人主页（2026-08）：资料 / 关注·粉丝 / 数据 / 发帖。
 * /profile = 自己；/profile/:id = 他人（可关注）。
 */
export function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const targetId = id ?? me?.id;
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);

  const load = useCallback(async () => {
    if (!targetId) return;
    try {
      const p = await profileApi.get(targetId);
      setProfile(p);
      setFollowing(p.isFollowing);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [targetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFollow = async () => {
    if (!profile) return;
    try {
      const r = await profileApi.follow(profile.user.id);
      setFollowing(r.following);
      setProfile({
        ...profile,
        followersCount: profile.followersCount + (r.following ? 1 : -1),
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

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
        <h1 className="flex-1 text-lg font-semibold">个人主页</h1>
        {profile?.isSelf && (
          <button
            onClick={() => navigate('/settings')}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-700 shadow-sm"
            aria-label="设置"
          >
            <Settings size={18} />
          </button>
        )}
      </header>

      <main className="px-4 pt-3">
        <ErrorBanner message={error} />
        {!profile && !error && <LoadingState />}
        {profile && (
          <div className="space-y-4">
            {/* 资料卡 */}
            <section className="rounded-card bg-surface p-5 text-center shadow-sm">
              <span className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-3xl font-semibold text-primary-600">
                {profile.user.avatarUrl ? (
                  <img src={profile.user.avatarUrl} alt="头像" className="h-full w-full object-cover" />
                ) : (
                  profile.user.username.slice(0, 1).toUpperCase()
                )}
              </span>
              <h2 className="mt-3 text-lg font-semibold">@{profile.user.username}</h2>
              <p className="mt-1 text-xs text-ink-500">{fmtDate(profile.user.createdAt)} 加入布谷</p>
              {profile.user.healthGoals && profile.user.healthGoals.length > 0 && (
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  {profile.user.healthGoals.map((g) => (
                    <span key={g} className="rounded-full bg-primary-50 px-2.5 py-1 text-[10px] text-primary-600">
                      {g}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center justify-center gap-6">
                <div>
                  <p className="text-lg font-bold text-primary-600">{profile.followersCount}</p>
                  <p className="text-[11px] text-ink-500">粉丝</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-primary-600">{profile.followingCount}</p>
                  <p className="text-[11px] text-ink-500">关注</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-primary-600">{profile.stats.completedLogs}</p>
                  <p className="text-[11px] text-ink-500">累计完成</p>
                </div>
              </div>
              {!profile.isSelf && (
                <button
                  onClick={() => void toggleFollow()}
                  className={`mx-auto mt-4 flex h-10 items-center gap-1.5 rounded-full px-5 text-sm font-medium ${
                    following ? 'bg-ink-100 text-ink-700' : 'bg-primary-500 text-white'
                  }`}
                >
                  {following ? (
                    <>
                      <Check size={15} /> 已关注
                    </>
                  ) : (
                    <>
                      <UserPlus size={15} /> 关注
                    </>
                  )}
                </button>
              )}
            </section>

            {/* 数据 */}
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-card bg-surface p-4 text-center shadow-sm">
                <p className="text-xl font-bold text-primary-600">{profile.stats.totalLogs}</p>
                <p className="mt-0.5 text-[11px] text-ink-500">累计记录</p>
              </div>
              <div className="rounded-card bg-surface p-4 text-center shadow-sm">
                <p className="text-xl font-bold text-primary-600">{profile.posts.length}</p>
                <p className="mt-0.5 text-[11px] text-ink-500">发帖数</p>
              </div>
            </section>

            {/* 发帖 */}
            <section>
              <h2 className="px-1 text-sm font-medium">
                {profile.isSelf ? '我的帖子' : 'TA 的帖子'}（{profile.posts.length}）
              </h2>
              {profile.posts.length === 0 ? (
                <p className="mt-2 rounded-card bg-surface p-6 text-center text-xs text-ink-300 shadow-sm">
                  还没有发帖
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {profile.posts.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => navigate(`/posts/${p.id}`)}
                        className="w-full rounded-card bg-surface px-4 py-3 text-left shadow-sm"
                      >
                        <p className="line-clamp-2 text-sm leading-relaxed">{p.content}</p>
                        <p className="mt-1.5 text-[10px] text-ink-300">
                          {new Date(p.createdAt).toLocaleDateString('zh-CN')} · 👍{p.likesCount} · 💬{p.commentsCount} · 🙋{p.joinedCount}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
