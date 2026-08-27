import { http } from '../http';
import { useLocal, useGuestMode } from '../../guest/localMode';
import { guestApi } from '../../guest/guestApi';
import { useGuestStore } from '../../guest/guestStore';
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
  /** #21：已保存到我的计划 = 已加入（删除计划后回退未加入） */
  joined?: boolean;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  coverUrl: string | null;
  ownerId: string;
  memberCount: number;
}

/** #17：在线拉取成功后写入本地缓存（断网时由 guestApi 供数——"断网前接收的数据"） */
/** #22：游客/离线禁用的账户操作统一错误（游客提示需登录；离线账户提示需联网） */
const accountOpErr = (act: string) =>
  new Error(useGuestMode() ? `请登录后使用（${act}需要正常账户）` : `当前未联网：${act}需联网后使用`);

const cacheWrite = (patch: Record<string, unknown>) => {
  const s = useGuestStore.getState();
  if (s.mirrorOf === null) return; // 无账户上下文（游客/未登录）不缓存
  useGuestStore.setState(patch as never);
  useGuestStore.getState().saveNow();
};

export const socialApi = {
  // 帖子
  listPosts: (page = 1, pageSize = 20) => {
    if (useLocal()) {
      const all = guestApi.feedPosts();
      const start = (page - 1) * pageSize;
      return Promise.resolve<Page<Post>>({
        items: all.slice(start, start + pageSize),
        total: all.length,
        page,
        pageSize,
      });
    }
    return http.get<Page<Post>>('/posts', { params: { page, pageSize } }).then((r) => {
      cacheWrite({ feed: r.data.items });
      return r.data;
    });
  },
  getPost: (id: string) => {
    if (useLocal()) {
      const p = guestApi.getFeedPost(id);
      if (p) return Promise.resolve<Post>(p);
      return Promise.reject(new Error('该帖子不在本地缓存中（断网前未加载过）'));
    }
    return http.get<Post>(`/posts/${id}`).then((r) => {
      const all = useGuestStore.getState().feed;
      const exists = all.some((x) => x.id === r.data.id);
      cacheWrite({ feed: exists ? all.map((x) => (x.id === r.data.id ? r.data : x)) : [r.data, ...all].slice(0, 200) });
      return r.data;
    });
  },
  createPost: (body: {
    content: string;
    mediaUrls?: string[];
    type?: string;
    planSnapshot?: Record<string, unknown> | null;
  }) =>
    useLocal()
      ? Promise.reject(accountOpErr('发布帖子'))
      : http.post<Post>('/posts', body).then((r) => r.data),
  updatePost: (id: string, content: string) =>
    useLocal()
      ? Promise.reject(accountOpErr('编辑帖子'))
      : http.patch<Post>(`/posts/${id}`, { content }).then((r) => r.data),
  removePost: (id: string) =>
    useLocal()
      ? Promise.reject(accountOpErr('删除帖子'))
      : http.delete(`/posts/${id}`).then((r) => r.data),

  // 互动
  like: (id: string) =>
    useLocal()
      ? Promise.reject(accountOpErr('点赞'))
      : http.post(`/posts/${id}/like`).then((r) => r.data),
  favorite: (id: string) =>
    useLocal()
      ? Promise.reject(accountOpErr('收藏'))
      : http.post(`/posts/${id}/favorite`).then((r) => r.data),
  comment: (id: string, content: string) =>
    useLocal()
      ? Promise.reject(accountOpErr('评论'))
      : http.post(`/posts/${id}/comment`, { content }).then((r) => r.data),
  comments: (id: string) =>
    useLocal()
      ? Promise.reject(new Error('当前离线，仅可浏览缓存内容'))
      : http
          .get<Page<{ id: string; content: string; createdAt: string }>>(`/posts/${id}/comments`)
          .then((r) => r.data),

  // 一键加入（社群/分享计划：仅账户可用；游客仅可加入官方计划）
  join: (id: string) =>
    useLocal()
      ? Promise.reject(
          new Error(useGuestMode() ? '游客仅可加入官方计划，社群计划请登录后加入' : '当前未联网：加入社群计划需联网后使用'),
        )
      : http.post(`/posts/${id}/join`).then((r) => r.data),
  leave: (id: string) =>
    useLocal()
      ? Promise.reject(
          new Error(useGuestMode() ? '游客仅可加入官方计划，社群计划请登录后操作' : '当前未联网：退出计划需联网后使用'),
        )
      : http.delete(`/posts/${id}/join`).then((r) => r.data),

  // 官方计划（#22：游客/离线账户本地加入——保存到我的计划）
  templates: () => {
    if (useLocal()) return Promise.resolve<PlanTemplate[]>(guestApi.templates());
    return http.get<PlanTemplate[]>('/plan-templates').then((r) => {
      cacheWrite({ templates: r.data });
      return r.data;
    });
  },
  /** 官方计划详情（预览页） */
  template: (id: string) => {
    if (useLocal()) {
      const t = guestApi.getTemplate(id);
      if (t) return Promise.resolve<PlanTemplate>(t);
      return Promise.reject(new Error('该官方计划不在本地缓存中'));
    }
    return http.get<PlanTemplate>(`/plan-templates/${id}`).then((r) => {
      const all = useGuestStore.getState().templates;
      const exists = all.some((x) => x.id === id);
      cacheWrite({ templates: exists ? all.map((x) => (x.id === id ? r.data : x)) : [r.data, ...all] });
      return r.data;
    });
  },
  joinTemplate: (id: string) =>
    useLocal()
      ? Promise.resolve(guestApi.joinOfficialTemplate(id))
      : http.post(`/plan-templates/${id}/join`).then((r) => r.data),
  /** #22：退出官方计划（本地=从我的计划移除；云端=移除+状态回退未加入） */
  leaveTemplate: (id: string) =>
    useLocal()
      ? Promise.resolve(guestApi.leaveOfficialTemplate(id))
      : http.delete(`/plan-templates/${id}/join`).then((r) => r.data),

  // 小组
  groups: () => {
    if (useLocal()) return Promise.resolve<Group[]>(guestApi.groups());
    return http.get<Group[]>('/groups').then((r) => {
      cacheWrite({ groups: r.data });
      return r.data;
    });
  },
  createGroup: (body: { name: string; description: string }) =>
    useLocal()
      ? Promise.reject(accountOpErr('创建小组'))
      : http.post<Group>('/groups', body).then((r) => r.data),
  joinGroup: (id: string) =>
    useLocal()
      ? Promise.reject(accountOpErr('加入小组'))
      : http.post(`/groups/${id}/join`).then((r) => r.data),
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
  list: () => {
    if (useLocal()) return Promise.resolve(guestApi.notifications());
    return http.get<Page<NotificationItem> & { unread: number }>('/notifications').then((r) => {
      cacheWrite({ notifications: r.data.items });
      return r.data;
    });
  },
  markRead: (id?: string) =>
    useLocal()
      ? Promise.reject(accountOpErr('标记已读'))
      : http.patch('/notifications/read', { id }).then((r) => r.data),
};
