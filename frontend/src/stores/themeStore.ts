/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3N0b3Jlcy90aGVtZVN0b3JlLnRzfDIwMjYtMDl8YzdhODFiZDgzNw== */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 可选主题（tokens.css 中定义变量覆盖） */
export type ThemeId = 'peach' | 'meadow' | 'glacier';

export const THEMES: { id: ThemeId; name: string; desc: string; dots: [string, string, string] }[] = [
  { id: 'peach', name: '蜜桃暖阳', desc: '奶油底 × 珊瑚橙，温馨治愈', dots: ['#F2764A', '#FFCDB0', '#FFF9F4'] },
  { id: 'meadow', name: '青翠晨露', desc: '布谷绿 × 白卡，清爽自然', dots: ['#3E8E7E', '#ABD9CC', '#F4FAF7'] },
  { id: 'glacier', name: '冰岛蓝湾', desc: '冰白 × 岛屿蓝，专业冷静', dots: ['#3D7EA6', '#B0D4EA', '#F5F9FC'] },
];

const META_COLOR: Record<ThemeId, string> = {
  peach: '#F2764A',
  meadow: '#3E8E7E',
  glacier: '#3D7EA6',
};

interface ThemeState {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}

/** 把主题写到 <html data-theme> 并同步浏览器状态栏/标题栏色 */
export function applyTheme(t: ThemeId) {
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_COLOR[t]);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'peach',
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    { name: 'cuckoo_theme' },
  ),
);

/** 应用启动时（渲染前）调用：读持久化主题，避免闪屏 */
export function initThemeFromStorage() {
  let t: ThemeId = 'peach';
  try {
    const raw = localStorage.getItem('cuckoo_theme');
    if (raw) {
      const parsed = JSON.parse(raw)?.state?.theme as ThemeId;
      if (parsed && THEMES.some((x) => x.id === parsed)) t = parsed;
    }
  } catch {
    /* 损坏数据回退默认 */
  }
  applyTheme(t);
  return t;
}
