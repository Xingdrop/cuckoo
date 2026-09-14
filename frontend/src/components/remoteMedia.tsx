/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL2NvbXBvbmVudHMvcmVtb3RlTWVkaWEudHN4fDIwMjYtMDl8YzIzNDQ1ZjcxNw== */ */
/**
 * 2026-09-08 真机修复（图片全挂根因）：部分 Android WebView（ColorOS/Android 16 实测）
 * 对 https://localhost 页面里的 http:// 跨源 <img>/<video> 请求会按 mixed-content 硬拦截
 * （CDP 实测 blockedReason:"mixed-content"，allowMixedContent:true 也不生效）；
 * 而 fetch()/XHR 不受此拦截，且后端 /uploads 已放开 CORP+CORS。
 * → 原生平台把服务器媒体 fetch 成 blob objectURL 再渲染；Web 端维持 absoluteUrl 原行为。
 * 失败时回退直连地址（Web 调试/降级场景）。
 *
 * 2026-09-14 补充（「大量图片丢失」）：guide 插画随 APK 打包，但重绘后的新图要等 APK 重建才进包，
 * 而普通 <img src="{http://局域网IP}/…"> 又会被上面这条混合内容规则拦死 → 插画改为候选链：
 * 联网「服务器图（带 ?v=，先 fetch 成 blob）→ 失败回退随包资源」，离线直接读随包资源。
 */
import { useEffect, useState, type ImgHTMLAttributes, type Ref, type VideoHTMLAttributes } from 'react';
import { Capacitor } from '@capacitor/core';
import { absoluteUrl } from '../services/http';
import { guideLocalUrl, guideServerUrl } from '../utils/guideMedia';

/** absUrl → objectURL 缓存（超出上限淘汰最旧并回收） */
const cache = new Map<string, string>();
const MAX_CACHE = 100;

/** navigator.onLine 的响应式封装：断网/恢复时重走插画候选链 */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export function useRemoteSrc(u?: string | null): string {
  const key = u ? absoluteUrl(u) : '';
  const guide = Boolean(u && u.includes('/uploads/guide/'));
  const online = useOnline();
  const [src, setSrc] = useState(() => {
    if (!key) return '';
    return Capacitor.isNativePlatform() ? (cache.get(key) ?? '') : key;
  });

  useEffect(() => {
    if (!key) {
      setSrc('');
      return;
    }
    if (!Capacitor.isNativePlatform()) {
      setSrc(key);
      return;
    }
    const hit = cache.get(key);
    if (hit) {
      setSrc(hit);
      return;
    }
    // 插画候选链：联网服务器优先（拿重绘新图），失败回退随包资源；离线只读随包资源。
    // 普通媒体仍只走自身绝对地址。
    const candidates = guide
      ? online
        ? [guideServerUrl(u), guideLocalUrl(u)]
        : [guideLocalUrl(u)]
      : [key];

    let alive = true;
    void (async () => {
      for (const c of candidates) {
        if (!c) continue;
        try {
          const r = await fetch(c);
          if (!r.ok) continue;
          const b = await r.blob();
          if (!alive) return;
          if (cache.size >= MAX_CACHE) {
            const oldest = cache.keys().next().value;
            if (oldest) {
              const old = cache.get(oldest);
              if (old) URL.revokeObjectURL(old);
              cache.delete(oldest);
            }
          }
          const obj = URL.createObjectURL(b);
          cache.set(key, obj);
          setSrc(obj);
          return;
        } catch {
          /* 该候选不可用：继续下一个 */
        }
      }
      if (alive) setSrc(candidates[candidates.length - 1] ?? key); // 兜底直连
    })();

    return () => {
      alive = false;
    };
  }, [key, guide, online, u]);

  return src;
}

/** 服务器媒体图片（APK 走 blob，Web 原样） */
export function RImg({ src, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...rest} src={useRemoteSrc(src)} />;
}

/** 服务器媒体视频（同上；小体积视频整段 blob 后播放；ref 透传供播放控制） */
export function RVideo({
  src,
  ref,
  ...rest
}: VideoHTMLAttributes<HTMLVideoElement> & { ref?: Ref<HTMLVideoElement> }) {
  return <video ref={ref} {...rest} src={useRemoteSrc(src)} />;
}
