import { http } from '../http';
import type { AuthResponse, User, UserSettings } from '../../types';

/** 认证与用户 API（FR-101~104） */
export const authApi = {
  register: (body: { username: string; password: string; healthGoals?: string[]; phone?: string }) =>
    http.post<AuthResponse>('/auth/register', body).then((r) => r.data),

  login: (body: { username: string; password: string }) =>
    http.post<AuthResponse>('/auth/login', body).then((r) => r.data),

  getMe: () => http.get<User>('/users/me').then((r) => r.data),

  updateMe: (patch: Partial<Pick<User, 'avatarUrl' | 'healthGoals' | 'timezone'>>) =>
    http.patch<User>('/users/me', patch).then((r) => r.data),

  getSettings: () => http.get<UserSettings>('/users/me/settings').then((r) => r.data),

  updateSettings: (patch: Partial<UserSettings>) =>
    http.put<UserSettings>('/users/me/settings', patch).then((r) => r.data),
};
