/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3NlcnZpY2VzL2h0dHAudHN8MjAyNi0wOXwwOGZmMDZhZjdj */
import axios, { AxiosError } from 'axios';
import { guideSrc } from '../utils/guideMedia';
import { Capacitor } from '@capacitor/core';
import { DEFAULT_NATIVE_API_BASE } from '../config/defaultApiBase';

/** 统一 API 错误体（与后端 AllExceptionsFilter 对齐，见 docs/技术方案设计.md §6.2） */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/** 全局 axios 实例：唯一 HTTP 出口（页面/组件禁止直接 import axios）。
 * - 自动注入 JWT token
 * - 401 时清理凭证并跳转登录页（保留回跳路径）
 * - 错误归一化为 ApiErrorBody
 * - #26：APK 可配置局域网服务器地址（设置 → 高级 → 服务器地址，仅存本机） */
export function apiBase(): string {
  const custom = localStorage.getItem('cuckoo_api_base') ?? '';
  if (custom) return `${custom.replace(/\/$/, '')}/api/v1`;
  // APK 兜底：构建时注入的局域网后端地址（用户未手动配置时开箱即用）
  if (Capacitor.isNativePlatform() && DEFAULT_NATIVE_API_BASE) {
    return `${DEFAULT_NATIVE_API_BASE.replace(/\/$/, '')}/api/v1`;
  }
  return '/api/v1';
}

export const http = axios.create({
  baseURL: apiBase(),
  timeout: 15000,
});

/** 切换服务器地址后重建 baseURL（保持拦截器） */
export function refreshApiBase() {
  http.defaults.baseURL = apiBase();
}

/** #26：把服务端相对路径（/uploads/…）转为当前服务器绝对地址（APK 连局域网服务器时图片/视频可显示） */
export function absoluteUrl(u?: string | null): string {
  if (!u) return '';
  if (/^https?:\/\//i.test(u) || u.startsWith('data:')) return u;
  // guide 插画：优先本地缓存（登录时校验缓存，离线/APK 直读本机）
  if (u.includes('/uploads/guide/')) return guideSrc(u);
  const custom = localStorage.getItem('cuckoo_api_base');
  // 2026-09-06：APK 未手动配置时也用内置默认地址拼绝对路径（否则 /uploads/* 打到 WebView 本地源 → 图片全挂）
  const origin = custom
    ? custom.replace(/\/$/, '')
    : Capacitor.isNativePlatform() && DEFAULT_NATIVE_API_BASE
      ? DEFAULT_NATIVE_API_BASE.replace(/\/$/, '')
      : '';
  return origin ? `${origin}${u}` : u;
}

/** token 存取（后续换 localStorage 加密或 cookie，接口不变） */
export const tokenStore = {
  get: () => localStorage.getItem('cuckoo_token'),
  set: (token: string) => localStorage.setItem('cuckoo_token', token),
  clear: () => localStorage.removeItem('cuckoo_token'),
};

http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => {
    // 防御（APK 注册/登录崩溃根因）：请求打到 WebView 本地源（服务器地址未配置/不可达）时，
    // SPA 兜底会返回 200 的 index.html——识别并给出可操作提示，避免上层读 undefined 崩溃
    if (typeof res.data === 'string' && /<!doctype html|<html[\s>]/i.test(res.data)) {
      return Promise.reject(new Error('服务器地址不可用（返回了网页而非接口数据）：请在「设置 → 高级 → 服务器地址」填写后端地址，例如 http://电脑IP:3000'));
    }
    return res;
  },
  (error: AxiosError<ApiErrorBody>) => {
    if (error.response?.status === 401) {
      tokenStore.clear();
      // 已在 /login 时不再硬跳转：避免 init() 的 getMe 401 触发 location.href 同页重载死循环
      if (!window.location.pathname.startsWith('/login')) {
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?redirect=${redirect}`;
      }
    }
    return Promise.reject(error);
  },
);

/** 提取统一错误信息（组件内直接用 errorMessage(e) 展示） */
export function errorMessage(e: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(e)) {
    const status = e.response?.status;
    // 500（无业务 message）统一友好提示（#7）
    if (status === 500) return '服务器内部错误，请稍后重试或联系管理员';
    return e.response?.data?.message ?? e.message;
  }
  return e instanceof Error ? e.message : '未知错误';
}
