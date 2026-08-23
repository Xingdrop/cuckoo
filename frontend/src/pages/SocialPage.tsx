import { Bell, Heart, ImagePlus, MessageCircle, PenSquare, Star, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { useAuthStore } from '../stores/authStore';
import { errorMessage } from '../services/http';
import { socialApi, Post, PlanTemplate, Group } from '../services/api/api.social';
import { filesApi } from '../services/api/api.files';
import { MediaGrid } from '../components/MediaGrid';
import { plansApi, profileApi } from '../services/api/api.plans';
import type { Plan } from '../services/api/api.plans';
import { notificationsApi } from '../services/api/api.social';

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  // 未来时间/跨年 → 显示完整日期（#5：修复"分钟前"错显示）
  if (diff < 0) return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * P-11 社区首页（FR-601~606, FR-609）
 * 帖子流 + 官方计划 + 兴趣小组 + 一键加入
 */
export function SocialPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'feed' | 'following' | 'mine' | 'templates' | 'groups'>('feed');
  const [posts, setPosts] = useState<Post[]>([]);
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [composerPlanId, setComposerPlanId] = useState<string>('');
  const [composerMedia, setComposerMedia] = useState<string[]>([]);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [myPlans, setMyPlans] = useState<Plan[]>([]);
  const [followingUsers, setFollowingUsers] = useState<{ id: string; username: string }[]>([]);
  const [joining, setJoining] = useState<string | null>(null);

  // #6 关注 tab 数据
  useEffect(() => {
    if (!user) return;
    profileApi
      .following(user.id)
      .then((u) => setFollowingUsers(u.map((x) => ({ id: x.id, username: x.username }))))
      .catch(() => setFollowingUsers([]));
  }, [user]);

  const load = useCallback(async () => {
    try {
      const [p, t, g, n] = await Promise.all([
        socialApi.listPosts(),
        socialApi.templates(),
        socialApi.groups(),
        notificationsApi.list(),
      ]);
      setPosts(p.items);
      setTemplates(t);
      setGroups(g);
      setUnread(n.unread);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleLike = async (post: Post) => {
    await socialApi.like(post.id);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, myLiked: !p.myLiked, likesCount: p.likesCount + (p.myLiked ? -1 : 1) }
          : p,
      ),
    );
  };

  const toggleFavorite = async (post: Post) => {
    await socialApi.favorite(post.id);
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, myFavorited: !p.myFavorited } : p)));
  };

  const joinPost = async (post: Post) => {
    setJoining(post.id);
    try {
      if (post.myJoined) {
        await socialApi.leave(post.id);
      } else {
        await socialApi.join(post.id);
      }
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, myJoined: !p.myJoined, joinedCount: p.joinedCount + (p.myJoined ? -1 : 1) }
            : p,
        ),
      );
    } finally {
      setJoining(null);
    }
  };

  const joinTemplate = async (t: PlanTemplate) => {
    await socialApi.joinTemplate(t.id);
    window.dispatchEvent(new CustomEvent('cuckoo:reminders-changed'));
    setError(null);
    alert(`已加入「${t.title}」，可在提醒列表查看`);
  };

  const joinGroup = async (g: Group) => {
    await socialApi.joinGroup(g.id);
    void load();
  };

  const publish = async () => {
    if (!composerText.trim()) return;
    try {
      let planSnapshot: Record<string, unknown> | null = null;
      if (composerPlanId) {
        planSnapshot = (await plansApi.snapshot(composerPlanId)) as unknown as Record<string, unknown>;
      }
      await socialApi.createPost({
        content: composerText.trim(),
        mediaUrls: composerMedia.length ? composerMedia : undefined,
        planSnapshot: planSnapshot ?? undefined,
      });
      setComposerText('');
      setComposerPlanId('');
      setComposerMedia([]);
      setShowComposer(false);
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  /** 选择图片 → 上传 → 加入 mediaUrls（#6：帖子支持传图） */
  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      setError(null);
      const { url } = await filesApi.upload(file);
      setComposerMedia((prev) => [...prev.slice(0, 3), url]);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const openComposer = () => {
    setShowComposer(true);
    void plansApi
      .list()
      .then((p) => setMyPlans(p))
      .catch(() => setMyPlans([]));
  };

  return (
    <div className="mx-auto max-w-md pb-20">
      <header className="flex items-center justify-between px-4 pt-6">
        <button
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2.5"
          aria-label="个人主页"
        >
          <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-surface shadow-sm">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="头像" className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-semibold text-primary-600">
                {user?.username?.slice(0, 1).toUpperCase() ?? '我'}
              </span>
            )}
          </span>
          <div className="text-left">
            <h1 className="text-lg font-semibold leading-tight">社交</h1>
            <p className="text-[11px] text-ink-500">我的主页 ›</p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/notifications')}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-700 shadow-sm"
            aria-label="通知"
          >
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[9px] font-bold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
          <button
            onClick={openComposer}
            className="flex h-10 items-center gap-1 rounded-full bg-primary-500 px-4 text-sm font-medium text-white"
          >
            <PenSquare size={15} /> 发布
          </button>
        </div>
      </header>

      {/* 分类 tab：广场 / 关注 / 我的 / 官方计划 / 小组（#6 关注过滤；#2 吸顶防遮挡） */}
      <div className="sticky top-[68px] z-10 mt-3 flex gap-1 overflow-x-auto bg-bg/95 px-4 py-1.5 backdrop-blur">
        {([
          ['feed', '广场'],
          ['following', '关注'],
          ['mine', '我的'],
          ['templates', '官方计划'],
          ['groups', '小组'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setTab(key);
              void load(); // #5：切换即刷新，与详情页操作同步
            }}
            className={`shrink-0 rounded-full px-4 py-2 text-sm transition-colors ${
              tab === key ? 'bg-primary-500 font-medium text-white' : 'bg-surface text-ink-700 shadow-sm'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <main className="px-4 pt-4">
        {error && (
          <p className="mb-3 rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{error}</p>
        )}

        {tab === 'following' && (
          <ul className="space-y-3">
            {(() => {
              const followingIds = new Set(followingUsers.map((u) => u.id));
              const shown = posts.filter((p) => followingIds.has(p.author.id));
              return shown.length === 0 ? (
                <div className="rounded-card bg-surface p-10 text-center text-sm text-ink-500 shadow-sm">
                  你关注的人还没有发帖
                </div>
              ) : (
                shown.map((post) => (
                  <li
                    key={post.id}
                    onClick={() => navigate(`/posts/${post.id}`)}
                    className="cursor-pointer rounded-card bg-surface p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-sm font-medium text-primary-600">
                        {post.author.username.slice(0, 1).toUpperCase()}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">@{post.author.username}</p>
                      <span className="text-[10px] text-ink-300">{fmtTime(post.createdAt)}</span>
                    </div>
                    <p className="mt-2.5 text-sm leading-relaxed">{post.content}</p>
                  </li>
                ))
              );
            })()}
          </ul>
        )}

        {tab === 'mine' && (
          <ul className="space-y-3">
            {posts.filter((p) => p.author.id === user?.id).length === 0 && (
              <div className="rounded-card bg-surface p-10 text-center text-sm text-ink-500 shadow-sm">
                你还没有发帖，点击右上角「发布」分享计划
              </div>
            )}
            {posts
              .filter((p) => p.author.id === user?.id)
              .map((post) => (
                <li
                  key={post.id}
                  onClick={() => navigate(`/posts/${post.id}`)}
                  className="cursor-pointer rounded-card bg-surface p-4 shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-sm font-medium text-primary-600">
                      {post.author.username.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">@{post.author.username}</p>
                      <p className="text-[10px] text-ink-300">
                        {fmtTime(post.createdAt)}
                        {post.updatedAt && new Date(post.updatedAt).getTime() - new Date(post.createdAt).getTime() > 60_000 ? ' · 已编辑' : ''}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/posts/${post.id}`);
                      }}
                      className="text-xs text-primary-600"
                    >
                      详情 ›
                    </button>
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed">{post.content}</p>
                  {post.mediaUrls.length > 0 && <MediaGrid urls={post.mediaUrls} className="mt-2" />}
                </li>
              ))}
          </ul>
        )}

        {tab === 'feed' && (
          <ul className="space-y-3">
            {posts.length === 0 && (
              <div className="rounded-card bg-surface p-10 text-center text-sm text-ink-500 shadow-sm">
                还没有动态，发布第一条吧
              </div>
            )}
            {posts.map((post) => (
              <li
                key={post.id}
                onClick={() => navigate(`/posts/${post.id}`)}
                className="cursor-pointer rounded-card bg-surface p-4 shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/profile/${post.author.id}`);
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-sm font-semibold text-primary-600"
                    aria-label={`查看 @${post.author.username} 的主页`}
                  >
                    {post.author.avatarUrl ? (
                      <img src={post.author.avatarUrl} alt="头像" className="h-full w-full object-cover" />
                    ) : (
                      post.author.username.slice(0, 1).toUpperCase()
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/profile/${post.author.id}`);
                      }}
                      className="block max-w-full truncate text-sm font-medium"
                    >
                      @{post.author.username}
                    </button>
                    <p className="text-[10px] text-ink-300">
                      {fmtTime(post.createdAt)}
                      {post.updatedAt && new Date(post.updatedAt).getTime() - new Date(post.createdAt).getTime() > 60_000 ? ' · 已编辑' : ''}
                    </p>
                  </div>
                  {post.type === 'official_plan' && (
                    <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] text-accent-700">官方</span>
                  )}
                </div>

                <p className="mt-3 text-sm leading-relaxed">{post.content}</p>

                {/* 帖子媒体（图片/视频 + 全屏预览，#8） */}
                {post.mediaUrls.length > 0 && <MediaGrid urls={post.mediaUrls} className="mt-3" />}

                {post.planSnapshot && (
                  <div className="mt-3 rounded-btn bg-primary-50/60 px-3.5 py-3">
                    <p className="text-xs font-medium text-primary-700">
                      📋 包含可加入的提醒计划
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void joinPost(post);
                      }}
                      disabled={joining === post.id}
                      className={`mt-2 w-full rounded-btn py-2.5 text-sm font-medium transition-colors ${
                        post.myJoined
                          ? 'bg-ink-100 text-ink-700'
                          : 'bg-primary-500 text-white'
                      }`}
                    >
                      {post.myJoined ? '✓ 已加入（点击退出）' : '一键加入计划'}
                    </button>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleLike(post);
                    }}
                    className={`flex items-center gap-1 ${post.myLiked ? 'text-danger-500' : ''}`}
                  >
                    <Heart size={15} fill={post.myLiked ? 'currentColor' : 'none'} />
                    {post.likesCount}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/posts/${post.id}`);
                    }}
                    className="flex items-center gap-1"
                  >
                    <MessageCircle size={15} /> {post.commentsCount}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleFavorite(post);
                    }}
                    className={`flex items-center gap-1 ${post.myFavorited ? 'text-accent-700' : ''}`}
                  >
                    <Star size={15} fill={post.myFavorited ? 'currentColor' : 'none'} /> 收藏
                  </button>
                  <span className="ml-auto flex items-center gap-1 text-primary-600">
                    <Users size={14} /> {post.joinedCount} 人已加入
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {tab === 'templates' && (
          <ul className="space-y-3">
            {templates.map((t) => (
              <li key={t.id} className="rounded-card bg-surface p-4 shadow-sm">
                <p className="text-sm font-medium">{t.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-500">{t.description}</p>
                <button
                  onClick={() => void joinTemplate(t)}
                  className="mt-3 w-full rounded-btn bg-primary-500 py-2.5 text-sm font-medium text-white"
                >
                  一键加入
                </button>
              </li>
            ))}
          </ul>
        )}

        {tab === 'groups' && (
          <ul className="space-y-3">
            {groups.map((g) => (
              <li key={g.id} className="rounded-card bg-surface p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-lg">
                    {g.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{g.name}</p>
                    <p className="truncate text-xs text-ink-500">{g.description}</p>
                  </div>
                  <span className="text-xs text-ink-500">{g.memberCount} 人</span>
                  <button
                    onClick={() => void joinGroup(g)}
                    className="rounded-full bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-600"
                  >
                    加入
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* 发布弹窗（可引用我的计划：#4/#9） */}
      {showComposer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8">
          <div className="w-full max-w-sm rounded-card bg-surface p-5 shadow-xl">
            <h3 className="text-base font-semibold">发布动态</h3>
            <textarea
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="分享你的计划或坚持心得；如引用计划，需填写文字说明…"
              className="mt-3 w-full resize-none rounded-btn border border-ink-100 p-3 text-sm outline-none focus:border-primary-400"
            />
            <p className="mt-2 text-[11px] text-ink-500">
              可选：引用「我的计划」——帖子可被一键加入，并显示引用来源
            </p>
            {/* #7：引用计划 = 按钮式（与加图一致） */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowPlanPicker((v) => !v)}
                className={`flex h-8 items-center gap-1 rounded-full px-3 text-xs ${
                  composerPlanId ? 'bg-primary-500 text-white' : 'bg-primary-50 text-primary-600'
                }`}
              >
                📋 {composerPlanId ? `已引用：${myPlans.find((p) => p.id === composerPlanId)?.name ?? ''}` : '引用计划'}
              </button>
              <label className="flex h-8 cursor-pointer items-center gap-1 rounded-full bg-primary-50 px-3 text-xs text-primary-600">
                <ImagePlus size={13} /> {composerMedia.length ? `已添加 ${composerMedia.length} 媒体` : '添加图片/视频'}
                <input
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => void pickImage(e.target.files?.[0])}
                />
              </label>
              {composerMedia.length > 0 && (
                <button onClick={() => setComposerMedia([])} className="text-xs text-danger-500">
                  清空
                </button>
              )}
            </div>
            {showPlanPicker && (
              <div className="mt-2 flex flex-wrap gap-2 rounded-btn bg-bg p-2">
                <button
                  onClick={() => setComposerPlanId('')}
                  className={`rounded-full px-3 py-1.5 text-xs ${
                    composerPlanId === '' ? 'bg-primary-500 text-white' : 'bg-ink-100 text-ink-700'
                  }`}
                >
                  不引用
                </button>
                {myPlans.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setComposerPlanId(p.id)}
                    className={`max-w-[160px] truncate rounded-full px-3 py-1.5 text-xs ${
                      composerPlanId === p.id ? 'bg-primary-500 text-white' : 'bg-ink-100 text-ink-700'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setShowComposer(false)}
                className="flex-1 rounded-btn bg-ink-100 py-3 text-sm font-medium text-ink-700"
              >
                取消
              </button>
              <button
                onClick={publish}
                disabled={!composerText.trim()}
                className="flex-1 rounded-btn bg-primary-500 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                发布
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
