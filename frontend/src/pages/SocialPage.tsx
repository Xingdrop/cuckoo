/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8c3JjL3BhZ2VzL1NvY2lhbFBhZ2UudHN4fDIwMjYtMDl8NWYxNzdmOThkMA== */
import { ArrowUp, Bell, Heart, ImagePlus, MessageCircle, PenSquare, Play, Star, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { PullToRefresh } from '../components/PullToRefresh';
import { useAuthStore } from '../stores/authStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useGuestStore } from '../guest/guestStore';
import { absoluteUrl, errorMessage } from '../services/http';
import { socialApi, Post, PlanTemplate } from '../services/api/api.social';
import { familyApi, type FamilyBindingItem } from '../services/api/api.family';
import { FamilyTab } from './social/FamilyTab';
import { filesApi } from '../services/api/api.files';
import { compressMediaFile } from '../utils/media';
import { MediaGrid } from '../components/MediaGrid';
import { LinkedText } from '../components/LinkedText';
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

/** #14：社交页 tab 定义（长按可拖动排序，顺序按账户记忆） */
const TABS = [
  ['feed', '广场'],
  ['following', '关注'],
  ['mine', '我的'],
  ['templates', '官方计划'],
  ['family', '亲友'],
] as const;
type TabKey = (typeof TABS)[number][0];
const TAB_ORDER_KEY = 'cuckoo.social.tabOrder';
const DEFAULT_TAB_ORDER: TabKey[] = TABS.map(([k]) => k);
/** 拖动期间阻止页面滚动/下拉刷新（非 passive 监听，仅在长按拖动时挂载） */
const preventTouchMove = (e: TouchEvent) => e.preventDefault();
const loadTabOrder = (uid: string): TabKey[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(`${TAB_ORDER_KEY}.${uid}`) ?? '[]') as string[];
    const valid = raw.filter((k) => DEFAULT_TAB_ORDER.includes(k as TabKey)) as TabKey[];
    return [...new Set(valid)].concat(DEFAULT_TAB_ORDER.filter((k) => !valid.includes(k)));
  } catch {
    return DEFAULT_TAB_ORDER;
  }
};

/**
 * P-11 社区首页（FR-601~604/606~608；兴趣小组已于 2026-09-05 移除）
 * 帖子流 + 官方计划 + 一键加入
 */
export function SocialPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const online = useConnectionStore((s) => s.online);
  const [tab, setTab] = useState<TabKey>('feed');
  // #14：tab 顺序（长按 350ms 进入拖动，实时换位，按账户记忆到 localStorage）
  const [tabOrder, setTabOrder] = useState<TabKey[]>(() => loadTabOrder(useAuthStore.getState().user?.id ?? 'guest'));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const pressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [family, setFamily] = useState<FamilyBindingItem[] | null>(null);
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
  const [showTop, setShowTop] = useState(false);
  const [netToast, setNetToast] = useState<number | null>(null);
  /** #21：计划操作成功提示（美观内联，替代 alert） */
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  // #19：刷新时断网提示（3 秒自动消失）
  useEffect(() => {
    if (netToast === null) return;
    const t = setTimeout(() => setNetToast(null), 3000);
    return () => clearTimeout(t);
  }, [netToast]);

  // #2：回到顶部按钮（滚动超过 400px 显示）
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // #14：账户切换时恢复该账户的 tab 顺序
  useEffect(() => {
    setTabOrder(loadTabOrder(user?.id ?? 'guest'));
  }, [user?.id]);

  const clearPress = useCallback(() => {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  // #14（真机修复「长按有提示但滑不动」）：连续 pointermove 间 React 渲染未提交时闭包里的
  // tabOrder/dragIdx 是旧值 → 换位被来回抵消。改为 orderRef/dragIdxRef 作权威值，
  // 监听器挂 document（长按后动态挂载，松手即卸载），不依赖组件重渲染。
  const orderRef = useRef<TabKey[]>(tabOrder);
  const dragIdxRef = useRef<number | null>(null);
  useEffect(() => {
    orderRef.current = tabOrder;
  }, [tabOrder]);

  // #14：tab 长按开始（350ms 震动进入拖动态）
  const onTabPointerDown = (e: React.PointerEvent, idx: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    clearPress();
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      dragIdxRef.current = idx;
      setDragIdx(idx);
      navigator.vibrate?.(30);
      document.addEventListener('touchmove', preventTouchMove, { passive: false });

      const onMove = (ev: PointerEvent) => {
        const from = dragIdxRef.current;
        if (from === null) return;
        const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-tab-idx]') as HTMLElement | null;
        if (!hit || hit.dataset.tabIdx === undefined) return;
        const target = Number(hit.dataset.tabIdx);
        if (Number.isNaN(target) || target === from) return;
        const order = [...orderRef.current];
        const [moved] = order.splice(from, 1);
        order.splice(target, 0, moved);
        orderRef.current = order;
        dragIdxRef.current = target;
        setTabOrder(order);
        setDragIdx(target);
        try {
          localStorage.setItem(`${TAB_ORDER_KEY}.${user?.id ?? 'guest'}`, JSON.stringify(order));
        } catch {
          /* 存储不可用时忽略 */
        }
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        document.removeEventListener('touchmove', preventTouchMove);
        if (dragIdxRef.current !== null) {
          // 长按进入过拖动态：本次点击不触发 tab 切换
          suppressClick.current = true;
          dragIdxRef.current = null;
          setDragIdx(null);
        }
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    }, 350);
  };

  // #6 关注 tab 数据 + #5 关注按钮
  const followingIds = useMemo(() => new Set(followingUsers.map((u) => u.id)), [followingUsers]);
  const refreshFollowing = useCallback(() => {
    if (!user) return;
    profileApi
      .following(user.id)
      .then((u) => setFollowingUsers(u.map((x) => ({ id: x.id, username: x.username }))))
      .catch(() => setFollowingUsers([]));
  }, [user]);
  useEffect(() => {
    refreshFollowing();
  }, [refreshFollowing]);

  /** #5：关注/取消关注（离线禁用——社交为联网功能） */
  const toggleFollowAuthor = async (authorId: string) => {
    if (!online) {
      setError('当前未联网：关注功能需联网后使用');
      return;
    }
    try {
      await profileApi.follow(authorId);
      refreshFollowing();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const load = useCallback(async (): Promise<boolean> => {
    if (!useConnectionStore.getState().online) {
      // #19：离线刷新 → 提示网络已断开（显示缓存）
      setNetToast(Date.now());
    }
    try {
      const [p, t, n, fam] = await Promise.all([
        socialApi.listPosts(),
        socialApi.templates(),
        notificationsApi.list(),
        user ? familyApi.listBindings().catch(() => [] as FamilyBindingItem[]) : Promise.resolve([] as FamilyBindingItem[]),
      ]);
      setPosts(p.items);
      setTemplates(t);
      setFamily(fam);
      // #26：铃铛角标不计入「每日提醒」类通知（missed）
      setUnread(n.items.filter((x) => x.type !== 'missed' && !x.isRead).length);
      return true;
    } catch (e) {
      if (!useConnectionStore.getState().online) setNetToast(Date.now());
      setError(errorMessage(e));
      return false;
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleLike = async (post: Post) => {
    // #22：账户操作统一走 api → 游客/离线给出明确提示（游客需登录；离线需联网）
    try {
      await socialApi.like(post.id);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, myLiked: !p.myLiked, likesCount: p.likesCount + (p.myLiked ? -1 : 1) }
            : p,
        ),
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const toggleFavorite = async (post: Post) => {
    try {
      await socialApi.favorite(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, myFavorited: !p.myFavorited } : p)));
    } catch (e) {
      setError(errorMessage(e));
    }
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
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setJoining(null);
    }
  };

  const joinTemplate = async (t: PlanTemplate) => {
    try {
      // #18/#22：保存到「我的计划」（本地=游客/离线可用；云端=服务器保存），计划页开启开关建提醒
      const r = (await socialApi.joinTemplate(t.id)) as { duplicate?: boolean };
      window.dispatchEvent(new CustomEvent('cuckoo:reminders-changed'));
      setError(null);
      setNotice(r.duplicate ? '该官方计划已在「我的计划」中，可前往计划页开启提醒' : `已把「${t.title}」保存到我的计划；在计划页开启开关即创建提醒`);
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  /** #22：退出官方计划（本地=从我的计划移除；云端=移除+状态回退未加入） */
  const leaveTemplate = async (t: PlanTemplate) => {
    try {
      await socialApi.leaveTemplate(t.id);
      setNotice(`已退出「${t.title}」，从我的计划移除`);
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const publish = async () => {
    // #24：发布按钮不置灰——点击给出明确提示（游客需登录 / 离线需联网）
    if (useGuestStore.getState().active) {
      setError('请登录后使用（发布需要正常账户）');
      return;
    }
    if (!online) {
      setError('当前未联网：发布帖子需联网后使用');
      return;
    }
    if (!composerText.trim()) return;
    // #4：引用的计划不能为空（后端同样拦截，这里提前提示）
    const chosen = myPlans.find((p) => p.id === composerPlanId);
    if (chosen && (chosen.reminderCount ?? 0) === 0) {
      setError(`计划「${chosen.name}」还没有提醒，不能引用发布`);
      return;
    }
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

  /** 选择图片 → 前端压缩 → 上传 → 加入 mediaUrls（#6；#1 图片压缩） */
  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      setError(null);
      const { url } = await filesApi.upload(await compressMediaFile(file));
      setComposerMedia((prev) => [...prev.slice(0, 3), url]);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const openComposer = () => {
    // #24：游客/离线点击 → 给出明确提示（按钮为灰色，但可点）
    if (useGuestStore.getState().active) {
      setError('请登录后使用（发布需要正常账户）');
      return;
    }
    if (!useConnectionStore.getState().online) {
      setError('当前未联网：发布帖子需联网后使用');
      return;
    }
    setShowComposer(true);
    void plansApi
      .list()
      .then((p) => setMyPlans(p))
      .catch(() => setMyPlans([]));
  };

  return (
    <div className="mx-auto max-w-md pb-20">
      <header className="flex items-center justify-between px-4 pt-2">
        <button
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2.5"
          aria-label="个人主页"
        >
          <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-surface shadow-sm">
            {user?.avatarUrl ? (
              <img src={absoluteUrl(user.avatarUrl)} alt="头像" className="h-full w-full object-cover" />
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
            className={`flex h-10 items-center gap-1 rounded-full px-4 text-sm font-medium ${
              online && !useGuestStore.getState().active
                ? 'bg-primary-500 text-white'
                : 'bg-ink-100 text-ink-400'
            }`}
            aria-label="发布"
          >
            <PenSquare size={15} /> 发布
          </button>
        </div>
      </header>

      {/* 分类 tab（#3：随内容滚动；#14：长按 350ms 可拖动排序，顺序按账户记忆） */}
      <div
        className="mt-2 flex touch-pan-x select-none gap-1 overflow-x-auto px-4 py-1.5"
        onContextMenu={(e) => dragIdx !== null && e.preventDefault()}
      >
        {tabOrder.map((key, i) => (
          <button
            key={key}
            data-tab-idx={i}
            onPointerDown={(e) => onTabPointerDown(e, i)}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              setTab(key);
              void load(); // #5：切换即刷新，与详情页操作同步
            }}
            className={`shrink-0 rounded-full px-4 py-2 text-sm transition-colors ${
              tab === key ? 'bg-primary-500 font-medium text-white' : 'bg-surface text-ink-700 shadow-sm'
            } ${dragIdx === i ? 'scale-110 shadow-lg ring-2 ring-primary-300' : ''}`}
          >
            {TABS.find(([k]) => k === key)![1]}
          </button>
        ))}
      </div>

      {/* #25：下拉刷新（广场/官方计划共用） */}
      <PullToRefresh onRefresh={load}>
      <main className="px-4 pt-4">
        {!online && (
          <p className="mb-3 rounded-btn bg-warning-500/15 px-3 py-2 text-[11px] text-ink-700">
            📡 网络已断开 — 以下为断网前接收的缓存内容，如需最新数据请联网后刷新（点赞 / 评论 / 关注 / 发帖等需联网使用）
          </p>
        )}
        {netToast !== null && (
          <p className="mb-3 rounded-btn bg-warning-500/20 px-3 py-2 text-[11px] font-medium text-ink-700">
            ⚠ 网络已断开，刷新失败 — 正在显示断网前缓存数据
          </p>
        )}
        {notice && (
          <p className="mb-3 rounded-btn bg-primary-50 px-3 py-2 text-[11px] font-medium text-primary-700">
            ✓ {notice}
          </p>
        )}
        {error && (
          <p className="mb-3 rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{error}</p>
        )}

        {tab === 'following' && (
          <ul className="space-y-3">
            {(() => {
              const shown = posts.filter((p) => followingIds.has(p.author.id));
              return shown.length === 0 ? (
                <div className="rounded-card bg-surface p-10 text-center text-sm text-ink-500 shadow-sm">
                  <p>你关注的人还没有发帖</p>
                  <p className="mt-1 text-xs text-ink-300">去关注感兴趣的朋友，他们的动态会出现在这里</p>
                  <button
                    onClick={() => {
                      setTab('feed');
                      void load();
                    }}
                    className="mt-4 rounded-full bg-primary-500 px-5 py-2.5 text-sm font-medium text-white"
                  >
                    去广场逛逛
                  </button>
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
                    <p className="mt-2.5 text-sm leading-relaxed">
                      <LinkedText text={post.content} />
                    </p>
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
                  <p className="mt-2.5 text-sm leading-relaxed">
                    <LinkedText text={post.content} />
                  </p>
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
                      <img src={absoluteUrl(post.author.avatarUrl)} alt="头像" className="h-full w-full object-cover" />
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
                  {post.author.id !== user?.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleFollowAuthor(post.author.id);
                      }}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${
                        followingIds.has(post.author.id)
                          ? 'bg-ink-100 text-ink-500'
                          : 'bg-primary-500 text-white'
                      }`}
                    >
                      {followingIds.has(post.author.id) ? '已关注' : '+ 关注'}
                    </button>
                  )}
                  {post.type === 'official_plan' && (
                    <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] text-accent-700">官方</span>
                  )}
                </div>

                <p className="mt-3 text-sm leading-relaxed">
                  <LinkedText text={post.content} />
                </p>

                {/* 帖子媒体（图片/视频 + 全屏预览，#8） */}
                {post.mediaUrls.length > 0 && <MediaGrid urls={post.mediaUrls} className="mt-3" />}

                {post.planSnapshot && (
                  <div className="mt-3 rounded-btn bg-primary-50/60 px-3 py-2">
                    {/* #2/#26：紧凑展示计划引用——缩小字号与留白，不占大面积 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/posts/${post.id}/plan`);
                      }}
                      className="flex w-full items-center gap-1.5 text-left"
                    >
                      <span className="text-[11px] text-primary-700">📋</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-primary-700">
                        {(post.planSnapshot as { from?: { name?: string } } | null)?.from?.name || '分享的计划'}
                      </span>
                      <span className="shrink-0 text-[9px] text-primary-500">查看详情 ›</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void joinPost(post);
                      }}
                      disabled={joining === post.id}
                      className={`mt-1.5 w-full rounded-btn py-2 text-xs font-medium transition-colors ${
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
                {/* 计划封面跟练图（可横滑预览） */}
                {(t.mediaUrls?.length ?? 0) > 0 && (
                  <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                    {t.mediaUrls!.slice(0, 6).map((u) => (
                      <img
                        key={u}
                        src={absoluteUrl(u)}
                        alt=""
                        loading="lazy"
                        className="h-20 w-28 shrink-0 rounded-btn bg-bg object-cover"
                      />
                    ))}
                  </div>
                )}
                <button
                  onClick={() => navigate(`/plan-templates/${t.id}`)}
                  className="flex w-full items-center gap-1.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      {t.joined && (
                        <span className="shrink-0 rounded-full bg-primary-500/15 px-2 py-0.5 text-[10px] font-medium text-primary-700">
                          ✓ 已加入
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{t.description}</span>
                    <span className="mt-1 block text-[10px] text-ink-400">加入后保存到「我的计划」，开启开关创建提醒</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-primary-500">查看详情 ›</span>
                </button>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => navigate(`/plan-templates/${t.id}`)}
                    className="flex-1 rounded-btn bg-ink-100/60 py-2.5 text-sm font-medium text-ink-700"
                  >
                    查看详情
                  </button>
                  {t.joined ? (
                    <button
                      onClick={() => void leaveTemplate(t)}
                      className="flex-1 rounded-btn bg-danger-500/10 py-2.5 text-sm font-medium text-danger-600"
                    >
                      退出计划
                    </button>
                  ) : (
                    <button
                      onClick={() => void joinTemplate(t)}
                      className="flex-1 rounded-btn bg-primary-500 py-2.5 text-sm font-medium text-white"
                    >
                      加入我的计划
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {tab === 'family' && (
          <FamilyTab family={family} onChanged={load} />
        )}
      </main>
      </PullToRefresh>

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
                <ImagePlus size={13} /> {composerMedia.length ? '添加更多' : '添加图片/视频'}
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
            {composerMedia.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {composerMedia.map((u, i) =>
                  u.match(/\.(mp4|mov|webm)/i) ? (
                    <div key={`${u}-${i}`} className="relative aspect-square w-full overflow-hidden rounded-btn bg-black">
                      <video src={absoluteUrl(u)} className="h-full w-full object-cover" preload="metadata" muted playsInline />
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white">
                          <Play size={14} fill="currentColor" />
                        </span>
                      </span>
                      <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
                        视频
                      </span>
                    </div>
                  ) : (
                    <span key={`${u}-${i}`} className="relative aspect-square w-full overflow-hidden rounded-btn bg-ink-100">
                      <img src={absoluteUrl(u)} alt={`媒体 ${i + 1}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setComposerMedia((prev) => prev.filter((x) => x !== u))}
                        aria-label="移除媒体"
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ),
                )}
              </div>
            )}
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

      {/* #2：一键回到顶部（社交 Tab 上方右下角） */}
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-[76px] right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg"
          aria-label="回到顶部"
        >
          <ArrowUp size={20} />
        </button>
      )}

      <BottomNav />
    </div>
  );
}
