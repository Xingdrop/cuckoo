/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL2NvbXBvbmVudHMvcmVtb3RlTWVkaWEudHN4fDIwMjYtMDl8OTM0ZTc1NTUzMQ== */
/**
 * 2026-09-08 真机修复（图片全挂根因）：部分 Android WebView（ColorOS/Android 16 实测）
 * 对 https://localhost 页面里的 http:// 跨源 <img>/<video> 请求会按 mixed-content 硬拦截
 * （CDP 实测 blockedReason:"mixed-content"，allowMixedContent:true 也不生效）；
 * 而 fetch()/XHR 不受此拦截，且后端 /uploads 已放开 CORP+CORS。
 * → 原生平台把服务器媒体 fetch 成 blob objectURL 再渲染；Web 端维持 absoluteUrl 原行为。
 * 失败时回退直连地址（Web 调试/降级场景）。
 */
import { useEffect, useState, type ImgHTMLAttributes, type Ref, type VideoHTMLAttributes } from 'react';
import { Capacitor } from '@capacitor/core';
import { absoluteUrl } from '../services/http';

/** absUrl → objectURL 缓存（超出上限淘汰最旧并回收） */
const cache = new Map<string, string>();
const MAX_CACHE = 100;

export function useRemoteSrc(u?: string | null): string {
  const key = u ? absoluteUrl(u) : '';
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
    let alive = true;
    fetch(key)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((b) => {
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
      })
      .catch(() => {
        if (alive) setSrc(key); // 回退直连
      });
    return () => {
      alive = false;
    };
  }, [key]);

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
