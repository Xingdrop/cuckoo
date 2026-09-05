/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3BhZ2VzL1Byb2ZpbGVQYWdlLnRzeHwyMDI2LTA5fDc4YzI3NGE1MTE= */
import { Check, ChevronLeft, Camera, Settings, UserPlus, HeartHandshake, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorBanner, LoadingState } from '../components/ui/Feedback';
import { profileApi, FavPost } from '../services/api/api.plans';
import type { ProfileView } from '../services/api/api.plans';
import { authApi } from '../services/api/api.auth';
import { filesApi } from '../services/api/api.files';
import { compressMediaFile } from '../utils/media';
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
  const setUser = useAuthStore((s) => s.setUser);
  const targetId = id ?? me?.id;
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [section, setSection] = useState<'posts' | 'favorites'>('posts');
  const [favs, setFavs] = useState<FavPost[]>([]);

  // #6：我的收藏（仅本人）
  useEffect(() => {
    if (!profile?.isSelf) return;
    profileApi
      .favorites(profile.user.id)
      .then((r) => setFavs(r.items))
      .catch(() => undefined);
  }, [profile]);

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

  /** 更换头像（#6：仅本人可操作） */
  const changeAvatar = async (file: File | undefined) => {
    if (!file) return;
    try {
      setError(null);
      const { url } = await filesApi.upload(await compressMediaFile(file));
      await authApi.updateMe({ avatarUrl: url });
      if (me) setUser({ ...me, avatarUrl: url });
      void load();
    } catch (e) {
      setError(errorMessage(e));
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
              <label className={`relative mx-auto block h-20 w-20 ${profile.isSelf ? 'cursor-pointer' : ''}`}>
                <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-primary-100 bg-primary-50 text-3xl font-semibold text-primary-600">
                  {profile.user.avatarUrl ? (
                    <img src={profile.user.avatarUrl} alt="头像" className="h-full w-full object-cover" />
                  ) : (
                    profile.user.username.slice(0, 1).toUpperCase()
                  )}
                </span>
                {profile.isSelf && (
                  <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-white shadow">
                    <Camera size={13} />
                  </span>
                )}
                {profile.isSelf && (
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void changeAvatar(e.target.files?.[0])}
                  />
                )}
              </label>
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
                <button
                  onClick={() => navigate(`/profile/${profile.user.id}/followers`)}
                  className="text-center"
                >
                  <p className="text-lg font-bold text-primary-600">{profile.followersCount}</p>
                  <p className="text-[11px] text-ink-500">粉丝</p>
                </button>
                <button
                  onClick={() => navigate(`/profile/${profile.user.id}/following`)}
                  className="text-center"
                >
                  <p className="text-lg font-bold text-primary-600">{profile.followingCount}</p>
                  <p className="text-[11px] text-ink-500">关注</p>
                </button>
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

            {/* 亲友与家人（家人绑定/摘要/聊天入口；M9 自设置迁移至此） */}
            {profile.isSelf && (
              <button
                onClick={() => navigate('/family')}
                className="flex w-full items-center gap-3 rounded-card bg-surface p-4 text-left shadow-sm"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <HeartHandshake size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">亲友与家人</span>
                  <span className="mt-0.5 block text-xs text-ink-500">邀请码绑定 · 健康摘要 · 聊天 · 通知联系人</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-ink-300" />
              </button>
            )}

            {/* 发帖/收藏（#6） */}
            <section>
              {profile.isSelf && (
                <div className="mb-2 flex gap-1 rounded-full bg-ink-100/60 p-1">
                  <button
                    onClick={() => setSection('posts')}
                    className={`flex-1 rounded-full py-1.5 text-xs font-medium ${
                      section === 'posts' ? 'bg-surface text-ink-700 shadow-sm' : 'text-ink-500'
                    }`}
                  >
                    帖子（{profile.posts.length}）
                  </button>
                  <button
                    onClick={() => setSection('favorites')}
                    className={`flex-1 rounded-full py-1.5 text-xs font-medium ${
                      section === 'favorites' ? 'bg-surface text-ink-700 shadow-sm' : 'text-ink-500'
                    }`}
                  >
                    收藏（{favs.length}）
                  </button>
                </div>
              )}
              {section === 'posts' ? (
                profile.posts.length === 0 ? (
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
                )
              ) : favs.length === 0 ? (
                <p className="mt-2 rounded-card bg-surface p-6 text-center text-xs text-ink-300 shadow-sm">
                  还没有收藏的帖子
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {favs.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => navigate(`/posts/${p.id}`)}
                        className="w-full rounded-card bg-surface px-4 py-3 text-left shadow-sm"
                      >
                        <p className="line-clamp-2 text-sm leading-relaxed">{p.content}</p>
                        <p className="mt-1.5 text-[10px] text-ink-300">
                          @{p.author.username} · {new Date(p.createdAt).toLocaleDateString('zh-CN')} · 👍{p.likesCount} · 💬{p.commentsCount} · 🙋{p.joinedCount}
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
