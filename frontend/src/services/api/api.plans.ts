/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3NlcnZpY2VzL2FwaS9hcGkucGxhbnMudHN8MjAyNi0wOXxlZjRiMzE1OThi */
import { http } from '../http';
import { useLocal, useGuestMode } from '../../guest/localMode';
import { guestApi } from '../../guest/guestApi';
import { recordCloudDelete, useGuestStore } from '../../guest/guestStore';
import { useAuthStore } from '../../stores/authStore';

export type PlanSourceType = 'self' | 'official' | 'share';

export interface Plan {
  id: string;
  userId: string;
  name: string;
  description: string;
  sourceType: PlanSourceType;
  sourceTitle: string | null;
  sourceId: string | null;
  isActive: boolean;
  createdAt: string;
  reminderCount?: number;
  /** #18：计划保存的提醒配置条数（开启开关后创建/重建） */
  configCount?: number;
}

/** #17：本地模式（游客/离线账户）计划读写走本地适配；快照/分享需联网 */
export const plansApi = {
  list: () =>
    useLocal()
      ? Promise.resolve(guestApi.plans())
      : http.get<Plan[]>('/plans').then((r) => r.data),
  create: (body: { name: string; description?: string }) =>
    useLocal()
      ? Promise.resolve(guestApi.createPlan(body))
      : http.post<Plan>('/plans', body).then((r) => r.data),
  snapshot: (id: string) =>
    useLocal()
      ? Promise.reject(new Error('离线模式暂不支持生成分享快照，请联网后使用'))
      : http.get<Record<string, unknown>>(`/plans/${id}/snapshot`).then((r) => r.data),
  patch: (id: string, patch: { name?: string; description?: string; isActive?: boolean }) =>
    useLocal()
      ? Promise.resolve(guestApi.patchPlan(id, patch))
      : http.patch<Plan>(`/plans/${id}`, patch).then((r) => r.data),
  remove: (id: string) =>
    useLocal()
      ? Promise.resolve(guestApi.removePlan(id))
      : http
          .delete(`/plans/${id}`)
          .then((r) => {
            // 2026-09-07：镜像同步删除+墓碑，防重登回灌复活
            recordCloudDelete('plans', id);
            return r.data;
          }),
  share: (id: string) =>
    useLocal()
      ? Promise.reject(new Error('离线模式暂不支持分享，请联网后使用'))
      : http.post(`/plans/${id}/share`).then((r) => r.data),
};

/** 个人主页（2026-08） */
export interface ProfileView {
  user: { id: string; username: string; avatarUrl: string | null; healthGoals: string[] | null; createdAt: string };
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  isSelf: boolean;
  stats: { totalLogs: number; completedLogs: number };
  posts: { id: string; content: string; type: string; createdAt: string; likesCount: number; commentsCount: number; joinedCount: number }[];
}

/**
 * 离线个人主页（#17）：用本地镜像数据拼出可展示的资料——
 * 帖子取已缓存的动态、统计取本地日志；粉丝数/关注数本地无权威数据，展示 0 与本地关注列表长度。
 * 不再发真实请求（否则断网时页面只剩「加载中…」或报错）。
 */
const localProfile = (userId: string): ProfileView => {
  const g = useGuestStore.getState();
  const me = useAuthStore.getState().user;
  const isSelf = Boolean(me && me.id === userId);
  const cached = g.feed.find((f) => f.author.id === userId)?.author;
  const author =
    isSelf && me
      ? { id: me.id, username: me.username, avatarUrl: me.avatarUrl ?? null }
      : (cached ?? { id: userId, username: '未知用户', avatarUrl: null });
  return {
    user: {
      ...author,
      healthGoals: isSelf ? (me?.healthGoals ?? null) : null,
      // 加入时间：本人取账户资料；他人本地无资料则留空（页面此时不渲染该行）
      createdAt: (isSelf ? me?.createdAt : '') ?? '',
    },
    followersCount: 0,
    followingCount: isSelf ? g.followings.length : 0,
    isFollowing: g.followings.includes(userId),
    isSelf,
    stats: {
      totalLogs: g.logs.length,
      completedLogs: g.logs.filter((l) => l.status === 'completed' || l.status === 'challenge_completed').length,
    },
    posts: g.feed
      .filter((f) => f.author.id === userId)
      .map((f) => ({
        id: f.id,
        content: f.content,
        type: f.type,
        createdAt: f.createdAt,
        likesCount: f.likesCount,
        commentsCount: f.commentsCount,
        joinedCount: f.joinedCount,
      })),
  };
};

export const profileApi = {
  get: (userId: string) =>
    useLocal()
      ? Promise.resolve(localProfile(userId))
      : http.get<ProfileView>(`/users/${userId}/profile`).then((r) => r.data),
  follow: (userId: string) =>
    useLocal()
      ? Promise.reject(new Error(useGuestMode() ? '请登录后使用（关注需要正常账户）' : '当前未联网：关注功能需联网后使用'))
      : http.post<{ following: boolean }>(`/users/${userId}/follow`).then((r) => r.data),
  followers: (userId: string) =>
    useLocal()
      ? // 粉丝列表未落本地缓存：不伪造空列表，明确提示需联网（与"需联网"标签语义一致）
        Promise.reject(new Error('粉丝列表需联网查看'))
      : http.get<{ id: string; username: string; avatarUrl: string | null }[]>(`/users/${userId}/followers`).then((r) => r.data),
  following: (userId: string) =>
    useLocal()
      ? Promise.resolve(guestApi.followingUsers())
      : http.get<{ id: string; username: string; avatarUrl: string | null }[]>(`/users/${userId}/following`).then((r) => r.data),
  /** #6：收藏列表（个人主页"我的收藏"）——离线取本地缓存中已收藏的帖子 */
  favorites: (userId: string) =>
    useLocal()
      ? Promise.resolve({
          items: useGuestStore
            .getState()
            .favorites.map((id) => useGuestStore.getState().feed.find((f) => f.id === id))
            .filter((f): f is NonNullable<typeof f> => Boolean(f))
            .map((f) => ({
              id: f.id,
              content: f.content,
              createdAt: f.createdAt,
              likesCount: f.likesCount,
              commentsCount: f.commentsCount,
              joinedCount: f.joinedCount,
              author: f.author,
            })),
          total: useGuestStore.getState().favorites.length,
        })
      : http.get<{ items: FavPost[]; total: number }>(`/users/${userId}/favorites`).then((r) => r.data),
};

/** 收藏帖子（与社区帖结构一致，可点进详情） */
export interface FavPost {
  id: string;
  content: string;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  joinedCount: number;
  author: { id: string; username: string; avatarUrl: string | null };
}
