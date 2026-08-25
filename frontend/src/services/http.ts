import axios, { AxiosError } from 'axios';

/** 统一 API 错误体（与后端 AllExceptionsFilter 对齐，见 docs/技术方案设计.md §6.2） */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * 全局 axios 实例：唯一 HTTP 出口（页面/组件禁止直接 import axios）。
 * - 自动注入 JWT token
 * - 401 时清理凭证并跳转登录页（保留回跳路径）
 * - 错误归一化为 ApiErrorBody
 */
export const http = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
});

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
  (res) => res,
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
