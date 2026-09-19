/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3NlcnZpY2VzL2h0dHAudHN8MjAyNi0wOXwwOGZmMDZhZjdj */
import axios, { AxiosError } from 'axios';
import { guideLocalUrl } from '../utils/guideMedia';
import { Capacitor } from '@capacitor/core';
import { DEFAULT_CLOUD_API_BASE, DEFAULT_NATIVE_API_BASE } from '../config/defaultApiBase';

/** 统一 API 错误体（与后端 AllExceptionsFilter 对齐，见 docs/技术方案设计.md §6.2） */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/** 服务器模式：局域网（与开发机同一 WiFi）/ 云端（公网正式服务器） */
export type ServerMode = 'lan' | 'cloud';

const MODE_KEY = 'cuckoo_server_mode';
/** 各模式各自保存地址，切换互不覆盖 */
const ADDR_KEY: Record<ServerMode, string> = { lan: 'cuckoo_api_lan', cloud: 'cuckoo_api_cloud' };
/** 生效地址（旧版单值键，保留供内部与工具读取） */
const EFFECTIVE_KEY = 'cuckoo_api_base';

/** 该模式的兜底地址：局域网=构建注入（仅原生）；云端=构建注入（留空则同源） */
export function defaultAddress(mode: ServerMode): string {
  if (mode === 'cloud') return DEFAULT_CLOUD_API_BASE;
  return Capacitor.isNativePlatform() && DEFAULT_NATIVE_API_BASE ? DEFAULT_NATIVE_API_BASE : '';
}

export function getServerMode(): ServerMode {
  return localStorage.getItem(MODE_KEY) === 'cloud' ? 'cloud' : 'lan';
}

/** 该模式已保存的地址（未保存过 → 旧版单值键迁移 / 空串） */
export function getServerAddress(mode: ServerMode): string {
  const v = localStorage.getItem(ADDR_KEY[mode]);
  if (v !== null) return v;
  // 旧版只有单值键（语义=局域网地址）：首次升级迁移为局域网配置
  return mode === 'lan' ? (localStorage.getItem(EFFECTIVE_KEY) ?? '') : '';
}

/** 该模式实际生效的 origin（无末尾斜杠） */
export function serverOrigin(mode: ServerMode = getServerMode()): string {
  return (getServerAddress(mode) || defaultAddress(mode)).replace(/\/$/, '');
}

/** 保存某模式地址（若为当前模式则立即生效） */
export function saveServerAddress(mode: ServerMode, addr: string): void {
  localStorage.setItem(ADDR_KEY[mode], addr.trim());
  if (mode === getServerMode()) applyServerMode();
}

/** 切换服务器模式并立即生效 */
export function switchServerMode(mode: ServerMode): void {
  localStorage.setItem(MODE_KEY, mode);
  applyServerMode();
}

/** 把当前模式地址同步到生效键并重建 baseURL（启动/切换后调用） */
export function applyServerMode(): void {
  const origin = serverOrigin();
  if (origin) localStorage.setItem(EFFECTIVE_KEY, origin);
  else localStorage.removeItem(EFFECTIVE_KEY);
  http.defaults.baseURL = apiBase();
}

/** 全局 axios 实例：唯一 HTTP 出口（页面/组件禁止直接 import axios）。
 * - 自动注入 JWT token
 * - 401 时清理凭证并跳转登录页（保留回跳路径）
 * - 错误归一化为 ApiErrorBody
 * - 服务器模式（设置 → 服务器）：局域网 / 云端 两套地址，仅存本机 */
export function apiBase(): string {
  const origin = serverOrigin();
  return origin ? `${origin}/api/v1` : '/api/v1';
}

export const http = axios.create({
  baseURL: apiBase(),
  timeout: 15000,
});

/**
 * 启动初始化：无模式记录时按构建配置推断——已烘焙云端地址 → 云端模式，否则局域网。
 * （模块加载即执行：保证首个请求前 baseURL 已定为最终值）
 */
export function initServerMode(): void {
  if (!localStorage.getItem(MODE_KEY)) {
    localStorage.setItem(MODE_KEY, defaultAddress('cloud') ? 'cloud' : 'lan');
  }
  applyServerMode();
}

initServerMode();

/** 切换服务器地址后重建 baseURL（保持拦截器） */
export function refreshApiBase() {
  http.defaults.baseURL = apiBase();
}

/** #26：把服务端相对路径（/uploads/…）转为当前服务器绝对地址（APK 连局域网/云端服务器时图片可显示） */
export function absoluteUrl(u?: string | null): string {
  if (!u) return '';
  if (/^https?:\/\//i.test(u) || u.startsWith('data:') || u.startsWith('blob:')) return u;
  // guide 插画：一律转为同源随包路径（离线可读，且规避 WebView 对 http:// 图片的混合内容硬拦截）；
  // 服务器新图由 RImg/useRemoteSrc 先 fetch 再回退随包资源，见 utils/guideMedia.ts
  if (u.includes('/uploads/guide/')) return guideLocalUrl(u);
  // 2026-09-06：APK 未手动配置时也用内置默认地址拼绝对路径（否则 /uploads/* 打到 WebView 本地源 → 图片全挂）
  const origin = serverOrigin();
  return origin ? `${origin}${u}` : u;
}

/** token 存取（后续换 localStorage 加密或 cookie，接口不变） */
export const tokenStore = {
  get: () => localStorage.getItem('cuckoo_token'),
  set: (token: string) => localStorage.setItem('cuckoo_token', token),
  clear: () => localStorage.removeItem('cuckoo_token'),
};

/** 联网状态快照：connectionStore 已 import 本模块（循环依赖），
 *  故只能动态导入后订阅并把状态缓存下来，供请求拦截器同步读取。 */
let connSnapshot: { online: boolean; lastCheck: number } = { online: true, lastCheck: 0 };
void import('../stores/connectionStore').then(({ useConnectionStore }) => {
  const sync = () => {
    const s = useConnectionStore.getState();
    connSnapshot = { online: s.online, lastCheck: s.lastCheck };
  };
  sync();
  useConnectionStore.subscribe(sync);
});

http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // 断网快速失败：探测已落定且离线时不再发请求（否则干等 15s 超时才报错）
  // 快照未就绪（lastCheck=0）时保持放行，避免冷启动误拦
  if (connSnapshot.lastCheck > 0 && !connSnapshot.online) {
    // 必须抛 AxiosError（而非普通 Error）：上层如 authStore.init() 用
    // axios.isAxiosError(e) && !e.response 判定「断网」，抛普通 Error 会被当成登录失效而清 token 登出
    return Promise.reject(new AxiosError('网络已断开，请联网后重试', 'ERR_NETWORK'));
  }
  return config;
});

http.interceptors.response.use(
  (res) => {
    // 防御（APK 注册/登录崩溃根因）：请求打到 WebView 本地源（服务器地址未配置/不可达）时，
    // SPA 兜底会返回 200 的 index.html——识别并给出可操作提示，避免上层读 undefined 崩溃
    if (typeof res.data === 'string' && /<!doctype html|<html[\s>]/i.test(res.data)) {
      return Promise.reject(new Error('服务器地址不可用（返回了网页而非接口数据）：请在「设置 → 服务器」填写后端地址，例如 http://电脑IP:3000'));
    }
    // 2026-09-07 全局自愈：任何 API 请求成功但联网标志仍为离线（健康探测误报/瞬时失败）→
    // 立即重探测恢复 online，避免「未联网」横幅在全应用残留（动态 import 避免与 connectionStore 循环依赖）
    void import('../stores/connectionStore').then(({ useConnectionStore }) => {
      if (!useConnectionStore.getState().online) void useConnectionStore.getState().refresh();
    });
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
    // axios 原始英文错误中文化
    if (!e.response) {
      if (e.code === 'ECONNABORTED' || /timeout/i.test(e.message)) {
        return '网络连接超时，请检查网络后重试';
      }
      return '网络已断开，请联网后重试';
    }
    return e.response.data?.message ?? e.message;
  }
  return e instanceof Error ? e.message : '未知错误';
}
