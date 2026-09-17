/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3V0aWxzL2d1aWRlTWVkaWEudHN8MjAyNi0wOXxjZjdhOTc1NzQ2 */
import { Capacitor } from '@capacitor/core';

/**
 * 引导插画（微运动库 / 官方计划跟练图）地址解析。
 *
 * 为什么插画必须走「随包本地资源」：ColorOS / Android 16 的 WebView 会把 https://localhost
 * 页面里的 http:// <img> 请求按混合内容硬拦截（allowMixedContent 也无效，见 components/remoteMedia.tsx），
 * 而服务器插画地址正是 http://<局域网IP>:3000/uploads/guide/**，直接塞进 <img src> 必挂。
 *
 * 两个地址的用途分工：
 * - guideLocalUrl(u)：同源随包路径 /guide/<name>.webp —— 离线可读，且是唯一能安全放进 <img src> 的地址；
 * - guideServerUrl(u)：服务器绝对地址（含 seed 注入的 ?v= 版本参数）—— 只能经 fetch() 读取，绝不可进 <img src>。
 *
 * 渲染统一走 RImg → useRemoteSrc：原生端「先 fetch 服务器图（拿重绘后的新图，不必等 APK 重建）
 * → 失败再回退随包资源」，离线时直接读随包资源。
 *
 * 2026-09-14 修复「大量图片丢失」根因：本表原缺 eye-2020-* / eye-blink-* / eye-care-1 /
 * eye-focus-* / water-8 共 8 个 AI 重绘插画名 → 这些名字被判为非随包资源 → 回退到服务器
 * http 地址 → 被混合内容拦截而整片挂掉。新增插画必须同步本表，
 * tests/unit/guideMedia.spec.ts 会对 public/guide 目录做强一致性校验（防止再次漏登记）。
 */
export const GUIDE_NAMES = [
  'water-1', 'water-5', 'water-7', 'water-8', 'water-generic',
  'medication-1', 'medication-2',
  'neck-1', 'neck-2', 'neck-ret-1', 'neck-ret-2',
  'shoulder-1', 'shoulder-2', 'wrist-1', 'wrist-2',
  'stretch-1', 'stretch-2',
  'kegel-1', 'kegel-2',
  'eye-far', 'eye-close', 'eye-2020-1', 'eye-2020-2',
  'eye-blink-1', 'eye-blink-2', 'eye-focus-1', 'eye-focus-2', 'eye-care-1',
  'squat-1', 'squat-2',
  'walk-1', 'walk-2', 'breathe-1', 'breathe-2', 'breathe-3',
  'standup-1', 'standup-2',
];

const GUIDE_SET = new Set(GUIDE_NAMES);

/**
 * 当前生效的服务器地址（cuckoo_api_base 由 services/http.ts 的 applyServerMode() 维护，
 * 已按「局域网 / 云端」模式解析完毕；空 = 同源）。此处不重复解析，避免与 http 循环依赖。
 */
function serverBase(): string {
  return (localStorage.getItem('cuckoo_api_base') ?? '').replace(/\/$/, '');
}

/** 从 /uploads/guide/<name>.webp[?v=xxx] 取出插画名；非 guide 地址返回空串 */
export function guideName(u?: string | null): string {
  if (!u) return '';
  const i = u.indexOf('/uploads/guide/');
  if (i === -1) return '';
  const rest = u.slice(i + '/uploads/guide/'.length);
  const q = rest.indexOf('?');
  const file = q === -1 ? rest : rest.slice(0, q);
  return file.replace(/\.webp$/i, '');
}

/** 该插画是否随包（决定离线能否直读） */
export function isBundledGuide(u?: string | null): boolean {
  return GUIDE_SET.has(guideName(u));
}

/** 同源随包路径；非 guide 地址原样返回 */
export function guideLocalUrl(u?: string | null): string {
  if (!u) return '';
  const name = guideName(u);
  return name ? `/guide/${name}.webp` : u;
}

/** 服务器绝对地址（仅供 fetch/axios 使用）；原生未配置服务器时退化为相对路径 */
export function guideServerUrl(u?: string | null): string {
  if (!u) return '';
  const i = u.indexOf('/uploads/guide/');
  if (i === -1) return u;
  const path = u.slice(i);
  if (!Capacitor.isNativePlatform()) return path;
  const base = serverBase();
  return base ? `${base}${path}` : path;
}
