/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3NlcnZpY2VzL2FwaS9hcGkuZmFtaWx5LnRzfDIwMjYtMDl8NTBkZGM3OWJjNw== */
import { http, errorMessage } from '../http';
import { useLocal, useGuestMode } from '../../guest/localMode';

/** 亲友绑定（账户级双向）：仅在线账户可用（游客/离线提示登录/联网） */
const familyOpErr = (act: string) =>
  new Error(useGuestMode() ? `请登录后使用（${act}需要正常账户）` : `当前未联网：${act}需联网后使用`);

const guard = <T>(fn: () => Promise<T>, act: string): Promise<T> => {
  if (useLocal()) return Promise.reject(familyOpErr(act));
  return fn();
};

export interface FamilyPeer {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface FamilyBindingItem {
  id: string;
  status: 'pending' | 'active';
  /** pending 时为 true = 待我同意（我是邀请码属主） */
  iAmApprover: boolean;
  peer: FamilyPeer;
  unread: number;
  createdAt: string;
}

export interface PartnerSummary {
  partner: FamilyPeer;
  date: string;
  summary: { planned: number; done: number; missed: number; rate: number; waterMl: number; waterGoalMl: number };
  reminders: {
    reminderId: string;
    title: string;
    category: string;
    categoryLabel: string | null;
    categoryIcon: string | null;
    countInRate: boolean;
    times: { time: string; status: string | null; photoUrl: string | null; actualTime: string | null }[];
  }[];
  photoLogs: { reminderTitle: string | null; time: string; photoUrl: string }[];
  medicines: {
    id: string;
    name: string;
    dosage: string | null;
    stock: number;
    threshold: number;
    instructions: string | null;
  }[];
}

export interface ChatMessageItem {
  id: string;
  senderId: string;
  content: string | null;
  photoUrl: string | null;
  createdAt: string;
  mine: boolean;
}

export const familyApi = {
  /** 我的当前邀请码（无 → code=null） */
  myInvite: () =>
    guard(
      () =>
        http
          .get<{ code: string | null; expiresAt: string | null }>('/family/invite')
          .then((r) => r.data),
      '查看邀请码',
    ),

  /** 生成/刷新邀请码 */
  createInvite: () =>
    guard(
      () =>
        http
          .post<{ code: string; expiresAt: string }>('/family/invite')
          .then((r) => r.data),
      '生成邀请码',
    ),

  /** 凭邀请码申请绑定 */
  bind: (code: string) =>
    guard(() => http.post<FamilyBindingItem>('/family/bind', { code }).then((r) => r.data), '申请绑定'),

  /** 我的绑定列表 */
  listBindings: () =>
    guard(() => http.get<FamilyBindingItem[]>('/family/bindings').then((r) => r.data), '加载亲友列表'),

  approve: (id: string) =>
    guard(() => http.post(`/family/bindings/${id}/approve`).then((r) => r.data), '同意绑定'),
  reject: (id: string) =>
    guard(() => http.post(`/family/bindings/${id}/reject`).then((r) => r.data), '拒绝绑定'),

  /** 解除绑定（即时生效；聊天记录保留） */
  unbind: (id: string) =>
    guard(() => http.delete(`/family/bindings/${id}`).then((r) => r.data), '解除绑定'),

  /** 对方某日健康摘要 */
  partnerSummary: (id: string, date?: string) =>
    guard(
      () =>
        http
          .get<PartnerSummary>(`/family/bindings/${id}/summary`, { params: date ? { date } : undefined })
          .then((r) => r.data),
      '查看健康摘要',
    ),

  /** 消息列表（after=增量游标） */
  messages: (id: string, after?: string) =>
    guard(
      () =>
        http
          .get<{ partner: FamilyPeer; items: ChatMessageItem[] }>(`/family/bindings/${id}/messages`, {
            params: after ? { after } : undefined,
          })
          .then((r) => r.data),
      '加载消息',
    ),

  /** 发送消息 */
  send: (id: string, body: { content?: string | null; photoUrl?: string | null }) =>
    guard(
      () => http.post<ChatMessageItem>(`/family/bindings/${id}/messages`, body).then((r) => r.data),
      '发送消息',
    ),

  /** 全部会话未读数 */
  unread: () =>
    guard(() => http.get<{ count: number }>('/family/unread').then((r) => r.data), '查询未读'),
};

/** 统一错误文案（页面直接展示） */
export const familyErrorMessage = errorMessage;
