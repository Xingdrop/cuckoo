/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3V0aWxzL2d1aWRlTWVkaWEudHN8MjAyNi0wOXxjZjdhOTc1NzQ2 */
/* @Sdrop PLACEHOLDER */
import { Capacitor } from '@capacitor/core';

/**
 * 引导插画本地缓存（2026-09-06）：
 * - 登录/启动（在线）时校验本地缓存是否齐全，缺失则拉取并以 dataURL 存 localStorage
 * - 渲染时 guideSrc()：/uploads/guide/** 一律优先读本地（离线/APK 直读本机，不再受服务器可达性影响）
 */

const KEY = 'cuckoo_guide_media';
const BASE = (() => {
  const custom = localStorage.getItem('cuckoo_api_base') ?? '';
  return custom ? custom.replace(/\/$/, '') : '';
})();

/** 与后端 seed-media guideIllustrations 的 key 对齐（新增插画后需同步此表） */
const GUIDE_NAMES = [
  'water-1', 'water-5', 'water-7', 'water-generic',
  'medication-1', 'medication-2',
  'neck-1', 'neck-2', 'neck-ret-1', 'neck-ret-2',
  'shoulder-1', 'shoulder-2', 'wrist-1',
  'stretch-1', 'stretch-2',
  'kegel-1', 'kegel-2',
  'eye-far', 'eye-close',
  'squat-1', 'squat-2', 'heel-1', 'heel-2',
  'walk-1', 'walk-2', 'breathe-1', 'breathe-2',
  'standup-1', 'standup-2',
];

type GuideCache = Record<string, string>;

function readCache(): GuideCache {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as GuideCache;
  } catch {
    return {};
  }
}

function writeCache(c: GuideCache) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* 存储满：放弃缓存（回退服务器 URL） */
  }
}

/** 登录/启动校验：缺失或损坏的插画重新拉取；全部齐备则跳过（不重复下载） */
export async function cacheGuideMedia(): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const cache = readCache();
    const missing = GUIDE_NAMES.filter((n) => !(typeof cache[n] === 'string' && cache[n].startsWith('data:image')));
    if (missing.length === 0) return;
    for (const name of missing) {
      const res = await fetch(`${BASE}/uploads/guide/${name}.webp`, { cache: 'force-cache' });
      if (!res.ok) continue;
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result ?? ''));
        fr.onerror = () => resolve('');
        fr.readAsDataURL(blob);
      });
      if (dataUrl) cache[name] = dataUrl;
    }
    writeCache(cache);
  } catch {
    /* 离线/失败：保留已有缓存 */
  }
}

/** 渲染地址解析：guide 插画 = 随 APP 打包的本地资源（/guide/*.webp，离线可用）；
 *  本地 dataURL 缓存其次；都没有才回退服务器地址 */
export function guideSrc(u?: string | null): string {
  if (!u) return '';
  const i = u.indexOf('/uploads/guide/');
  if (i === -1) return u;
  const name = u.slice(i + '/uploads/guide/'.length).replace(/\.webp$/, '');
  if (GUIDE_NAMES.includes(name)) return `/guide/${name}.webp`;
  const cached = readCache()[name];
  if (cached && cached.startsWith('data:image')) return cached;
  return Capacitor.isNativePlatform() && BASE ? `${BASE}${u}` : u;
}
