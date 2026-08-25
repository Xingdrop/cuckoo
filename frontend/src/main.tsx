// @Sdrop 布谷(Cuckoo) v1 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL21haW4udHN4fDIwMjYtMDg=
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/tokens.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
