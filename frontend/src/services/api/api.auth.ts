/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3NlcnZpY2VzL2FwaS9hcGkuYXV0aC50c3wyMDI2LTA5fDg1NDgyMzZmOGQ= */
import { http } from '../http';
import { useLocal } from '../../guest/localMode';
import { guestApi } from '../../guest/guestApi';
import type { AuthResponse, User, UserSettings } from '../../types';

/** 认证与用户 API（FR-101~104）——#17 设置读写支持本地模式 */
export const authApi = {
  register: (body: { username: string; password: string; healthGoals?: string[]; phone?: string }) =>
    http.post<AuthResponse>('/auth/register', body).then((r) => r.data),

  login: (body: { username: string; password: string }) =>
    http.post<AuthResponse>('/auth/login', body).then((r) => r.data),

  getMe: () => http.get<User>('/users/me').then((r) => r.data),

  updateMe: (patch: Partial<Pick<User, 'avatarUrl' | 'healthGoals' | 'timezone'>>) =>
    http.patch<User>('/users/me', patch).then((r) => r.data),

  getSettings: () =>
    useLocal()
      ? Promise.resolve(guestApi.settings())
      : http.get<UserSettings>('/users/me/settings').then((r) => r.data),

  updateSettings: (patch: Partial<UserSettings>) =>
    useLocal()
      ? Promise.resolve(guestApi.saveSettings(patch))
      : http.put<UserSettings>('/users/me/settings', patch).then((r) => r.data),
};
