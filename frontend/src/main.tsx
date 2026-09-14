/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL21haW4udHN4fDIwMjYtMDl8MWY4NTMwZDFmMw== */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initThemeFromStorage } from './stores/themeStore';
import './styles/tokens.css';

// 渲染前应用持久化主题（避免主题闪屏）
initThemeFromStorage();

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
