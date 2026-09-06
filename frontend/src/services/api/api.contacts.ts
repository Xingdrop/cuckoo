/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8c3JjL3NlcnZpY2VzL2FwaS9hcGkuY29udGFjdHMudHN8MjAyNi0wOXwxMWFmMWNhNzIz */
import { http } from '../http';
import { useLocal, useGuestMode } from '../../guest/localMode';
import type { ContactInput } from '../../types/schemas';

/** 亲友联系人（漏服/库存预警通知数据源）：仅在线账户可用 */
const contactOpErr = (act: string) =>
  new Error(useGuestMode() ? `请登录后使用（${act}需要正常账户）` : `当前未联网：${act}需联网后使用`);

export interface EmergencyContactItem {
  id: string;
  name: string;
  phone: string | null;
  relation: string | null;
  appUserId: string | null;
  receiveLowStock: boolean;
  receiveMissed: boolean;
  createdAt: string;
}

const guard = <T>(fn: () => Promise<T>, act: string): Promise<T> => {
  if (useLocal()) return Promise.reject(contactOpErr(act));
  return fn();
};

export const contactsApi = {
  list: () => guard(() => http.get<EmergencyContactItem[]>('/contacts').then((r) => r.data), '加载联系人'),

  create: (body: ContactInput) =>
    guard(() => http.post<EmergencyContactItem>('/contacts', body).then((r) => r.data), '添加联系人'),

  update: (id: string, body: Partial<ContactInput>) =>
    guard(() => http.patch<EmergencyContactItem>(`/contacts/${id}`, body).then((r) => r.data), '编辑联系人'),

  remove: (id: string) =>
    guard(() => http.delete(`/contacts/${id}`).then((r) => r.data), '删除联系人'),
};
