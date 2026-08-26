import { http } from '../http';
import { useGuestStore } from '../../guest/guestStore';

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
}

export const plansApi = {
  list: () =>
    useGuestStore.getState().active ? Promise.resolve([] as Plan[]) : http.get<Plan[]>('/plans').then((r) => r.data),
  create: (body: { name: string; description?: string }) =>
    http.post<Plan>('/plans', body).then((r) => r.data),
  snapshot: (id: string) => http.get<Record<string, unknown>>(`/plans/${id}/snapshot`).then((r) => r.data),
  patch: (id: string, patch: { name?: string; description?: string; isActive?: boolean }) =>
    http.patch<Plan>(`/plans/${id}`, patch).then((r) => r.data),
  remove: (id: string) => http.delete(`/plans/${id}`).then((r) => r.data),
  share: (id: string) => http.post(`/plans/${id}/share`).then((r) => r.data),
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
  follow: (userId: string) => http.post<{ following: boolean }>(`/users/${userId}/follow`).then((r) => r.data),
  followers: (userId: string) =>
    http.get<{ id: string; username: string; avatarUrl: string | null }[]>(`/users/${userId}/followers`).then((r) => r.data),
  following: (userId: string) =>
    http.get<{ id: string; username: string; avatarUrl: string | null }[]>(`/users/${userId}/following`).then((r) => r.data),
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
