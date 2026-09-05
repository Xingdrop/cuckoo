// @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL21haW4udHN4fDIwMjYtMDh8M2Q2ODNmODk5MQ==
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initThemeFromStorage } from './stores/themeStore';
import './styles/tokens.css';

// 渲染前应用持久化主题（避免主题闪屏）
initThemeFromStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
