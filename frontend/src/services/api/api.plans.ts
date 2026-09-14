/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3NlcnZpY2VzL2FwaS9hcGkucGxhbnMudHN8MjAyNi0wOXxlZjRiMzE1OThi */
import { http } from '../http';
import { useLocal, useGuestMode } from '../../guest/localMode';
import { guestApi } from '../../guest/guestApi';
import { recordCloudDelete } from '../../guest/guestStore';

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

export const profileApi = {
  get: (userId: string) => http.get<ProfileView>(`/users/${userId}/profile`).then((r) => r.data),
  follow: (userId: string) =>
    useLocal()
      ? Promise.reject(new Error(useGuestMode() ? '请登录后使用（关注需要正常账户）' : '当前未联网：关注功能需联网后使用'))
      : http.post<{ following: boolean }>(`/users/${userId}/follow`).then((r) => r.data),
  followers: (userId: string) =>
    http.get<{ id: string; username: string; avatarUrl: string | null }[]>(`/users/${userId}/followers`).then((r) => r.data),
  following: (userId: string) =>
    useLocal()
      ? Promise.resolve(guestApi.followingUsers())
      : http.get<{ id: string; username: string; avatarUrl: string | null }[]>(`/users/${userId}/following`).then((r) => r.data),
  /** #6：收藏列表（个人主页"我的收藏"） */
  favorites: (userId: string) =>
    http.get<{ items: FavPost[]; total: number }>(`/users/${userId}/favorites`).then((r) => r.data),
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
