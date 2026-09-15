/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL2d1ZXN0L2d1ZXN0Q29udGVudC50c3wyMDI2LTA5fGUyYWMyYTI1YTU= */
import { useGuestStore, type GuestTemplate, type GuestExercise } from './guestStore';

/**
 * 游客内容包（public/guest-content.json）：
 * - 仅含官方计划模板 + 微运动动作，**不含任何用户/账户数据**（旧版 offline-seed.json 已移除）；
 * - App 启动时加载并写入本地游客缓存（seedSocial），游客模式直接可用。
 */
const CONTENT_FILE = '/guest-content.json';
/** 旧版 APK 预置离线种子的 localStorage 缓存键（含账户数据，升级后清除） */
const LEGACY_SEED_KEY = 'cuckoo_seed_v2';

interface GuestContentFile {
  version: number;
  templates?: GuestTemplate[];
  exercises?: GuestExercise[];
}

let cached: GuestContentFile | null = null;

/** 启动引导：拉取内容包写入游客缓存；顺带清除旧版预置种子缓存 */
export async function bootstrapGuestContent(): Promise<GuestContentFile | null> {
  try {
    localStorage.removeItem(LEGACY_SEED_KEY);
  } catch {
    /* 忽略 */
  }
  if (cached) return cached;
  try {
    // 绝对路径失败时回退相对路径（个别 WebView/子路径部署场景）
    let res = await fetch(CONTENT_FILE).catch(() => null);
    if (!res || !res.ok) res = await fetch('guest-content.json').catch(() => null);
    if (!res || !res.ok) return null;
    const c = (await res.json()) as GuestContentFile;
    if (!c || !Array.isArray(c.templates) || !Array.isArray(c.exercises)) return null;
    cached = c;
    useGuestStore.getState().seedSocial({ templates: c.templates, exercises: c.exercises });
    return c;
  } catch {
    return null;
  }
}
