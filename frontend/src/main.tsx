/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL21haW4udHN4fDIwMjYtMDh8M2Q2ODNmODk5MQ== */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initThemeFromStorage } from './stores/themeStore';
import './styles/tokens.css';

// 渲染前应用持久化主题（避免主题闪屏）
initThemeFromStorage();

/**
 * Service Worker 注册策略（2026-09-18 真机问题修复）
 * 打包进 APK 的 dist 里曾带 registerSW.js，装新包后 WebView 里残留的旧 SW 会用它的
 * 预缓存继续供上一版 index.html / JS → 表现为「代码改了但装包后行为没变」。
 * 原生端：不注册 SW；发现残留 SW 或 Cache Storage 时注销并清空后只重载一次。
 * Web 端：行为不变，仍注册 /sw.js（PWA 离线与 Web Push 依赖它）。
 */
const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
if (capacitor?.isNativePlatform?.()) {
  const PURGE_KEY = 'cuckoo.swPurged';
  if (typeof navigator.serviceWorker !== 'undefined' && !sessionStorage.getItem(PURGE_KEY)) {
    void (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        const keys = typeof caches === 'undefined' ? [] : await caches.keys();
        if (regs.length === 0 && keys.length === 0) return;
        sessionStorage.setItem(PURGE_KEY, '1');
        await Promise.all([
          ...regs.map((r) => r.unregister()),
          ...keys.map((k) => caches.delete(k)),
        ]);
        location.reload();
      } catch {
        /* 清理失败则按当前缓存继续运行，不影响启动 */
      }
    })();
  }
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  });
}

// 真机诊断：捕获未处理异常/拒绝（含语音探测链路），经 logcat Capacitor/Console 可见。
// 仅开发构建输出，避免发布版把堆栈信息写进 logs（2026-09-14 公开前加固）
if (import.meta.env.DEV) {
  window.addEventListener('error', (e) => console.log('[SR-GLOBAL] error:', e.message, e.filename, e.lineno));
  window.addEventListener('unhandledrejection', (e) =>
    console.log('[SR-GLOBAL] rejection:', String(e.reason).slice(0, 200)),
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
