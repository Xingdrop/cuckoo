import { http } from '../http';
import type { Page } from '../../types';

export interface PostAuthor {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface Post {
  id: string;
  userId: string;
  type: string;
  content: string;
  mediaUrls: string[];
  planSnapshot: Record<string, unknown> | null;
  likesCount: number;
  commentsCount: number;
  joinedCount: number;
  createdAt: string;
  /** 2026-08：编辑后 updatedAt > createdAt（显示"已编辑"） */
  updatedAt?: string;
  author: PostAuthor;
  myLiked: boolean;
  myFavorited: boolean;
  myJoined: boolean;
}

export interface PlanTemplate {
  id: string;
  title: string;
  description: string;
  reminderConfig: Record<string, unknown>[];
  mediaUrls: string[];
  version: number;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  coverUrl: string | null;
  ownerId: string;
  memberCount: number;
}

export const socialApi = {
  // 帖子
  listPosts: (page = 1, pageSize = 20) =>
    http.get<Page<Post>>('/posts', { params: { page, pageSize } }).then((r) => r.data),
  getPost: (id: string) => http.get<Post>(`/posts/${id}`).then((r) => r.data),
  createPost: (body: {
    content: string;
    mediaUrls?: string[];
    type?: string;
    planSnapshot?: Record<string, unknown> | null;
  }) => http.post<Post>('/posts', body).then((r) => r.data),
  updatePost: (id: string, content: string) =>
    http.patch<Post>(`/posts/${id}`, { content }).then((r) => r.data),
  removePost: (id: string) => http.delete(`/posts/${id}`).then((r) => r.data),

  // 互动
  like: (id: string) => http.post(`/posts/${id}/like`).then((r) => r.data),
  favorite: (id: string) => http.post(`/posts/${id}/favorite`).then((r) => r.data),
  comment: (id: string, content: string) =>
    http.post(`/posts/${id}/comment`, { content }).then((r) => r.data),
  comments: (id: string) => http.get<Page<{ id: string; content: string; createdAt: string }>>(`/posts/${id}/comments`).then((r) => r.data),

  // 一键加入
  join: (id: string) => http.post(`/posts/${id}/join`).then((r) => r.data),
  leave: (id: string) => http.delete(`/posts/${id}/join`).then((r) => r.data),

  // 官方计划
  templates: () => http.get<PlanTemplate[]>('/plan-templates').then((r) => r.data),
  joinTemplate: (id: string) => http.post(`/plan-templates/${id}/join`).then((r) => r.data),

  // 小组
  groups: () => http.get<Group[]>('/groups').then((r) => r.data),
  createGroup: (body: { name: string; description: string }) =>
    http.post<Group>('/groups', body).then((r) => r.data),
  joinGroup: (id: string) => http.post(`/groups/${id}/join`).then((r) => r.data),
};

/** 通知中心 */
export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  content: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export const notificationsApi = {
  list: () => http.get<Page<NotificationItem> & { unread: number }>('/notifications').then((r) => r.data),
  markRead: (id?: string) => http.patch('/notifications/read', { id }).then((r) => r.data),
};
