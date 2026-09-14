/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3NlcnZpY2VzL3Bob3RvRXhwb3J0LnRzfDIwMjYtMDl8MDQyZDk1ZDc1Yw== */
/**
 * #36（2026-09-10 深夜）：照片导出到手机真实文件。
 * 用户痛点：报告内嵌 base64 照片「找不到文件」——本模块把用户数据里的全部照片
 * （提醒执行记录拍照 + 药品照片）通过 NativePhotoSaver 原生插件写入手机公共
 * 「Download/布谷照片/」目录（MediaStore，无需存储权限），并返回绝对路径展示。
 * - 文件名取上传文件原名 → 重复导出按同名自动跳过，不产生副本；
 * - 游客模式（useLocal）从本地 bundle 收集（data: URI 或已上传的 /uploads 路径）；
 * - 仅 APK 生效，Web 返回 null（浏览器由下载管理）。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { absoluteUrl } from './http';
import { remindersApi } from './api/api.reminders';
import { medicinesApi } from './api/api.medicines';
import { useGuestStore } from '../guest/guestStore';
import { useLocal } from '../guest/localMode';

interface NativePhotoSaverProxy {
  savePhotos(o: { photos: { name: string; data: string }[] }): Promise<{
    dir: string;
    saved: number;
    skipped: number;
    failed: number;
  }>;
}

export interface PhotoExportResult {
  /** 照片落地的绝对目录（如 /storage/emulated/0/Download/布谷照片）；无照片时为空串 */
  dir: string;
  saved: number;
  skipped: number;
  failed: number;
}

/** 去重保序 */
function dedupe(urls: string[]): string[] {
  return [...new Set(urls)];
}

/** 稳定短哈希（双 32 位 djb2，64 位等效空间）：为无原名/可替换来源生成可去重的文件名 */
export function shortHash(s: string): string {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) >>> 0;
    h2 = ((h2 << 5) + h2 + c) >>> 0;
  }
  return (h1 % 1299709).toString(36) + (h2 % 1303457).toString(36);
}

/** 收集全部照片源 URL（登录=API 分页全量；游客=本地 bundle） */
async function collectPhotoUrls(): Promise<string[]> {
  const urls: string[] = [];
  if (useLocal()) {
    const bundle = useGuestStore.getState().exportBundle() as {
      logs?: { photoUrl?: string | null }[];
      medicines?: { photoUrl?: string | null; photoUrls?: string[] | null }[];
    };
    for (const l of bundle.logs ?? []) if (l.photoUrl) urls.push(l.photoUrl);
    for (const m of bundle.medicines ?? []) {
      for (const u of m.photoUrls ?? []) urls.push(u);
      if (m.photoUrl) urls.push(m.photoUrl);
    }
    return dedupe(urls);
  }
  // 提醒执行记录照片：分页拉全量（同统计页照片墙口径）
  const reminders = await remindersApi.list();
  for (const r of reminders) {
    try {
      const items: { photoUrl?: string | null }[] = [];
      for (let page = 1; ; page++) {
        const p = await remindersApi.logs(r.id, page, 100);
        items.push(...(p.items as { photoUrl?: string | null }[]));
        if (items.length >= p.total || p.items.length === 0) break;
      }
      for (const it of items) if (it.photoUrl) urls.push(it.photoUrl);
    } catch {
      /* 单个提醒失败跳过 */
    }
  }
  // 药品照片（失败不阻塞主流程）
  try {
    const meds = await medicinesApi.list();
    for (const m of meds) for (const u of m.photoUrls ?? []) urls.push(u);
  } catch {
    /* 忽略 */
  }
  return dedupe(urls);
}

/** URL/base64 源 → 纯 base64（无 data: 前缀）；失败返回 null */
async function toBase64(src: string): Promise<string | null> {
  try {
    if (src.startsWith('data:')) return src.slice(src.indexOf(',') + 1);
    const res = await fetch(absoluteUrl(src));
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => {
        const s = String(fr.result);
        resolve(s.slice(s.indexOf(',') + 1));
      };
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** 文件名：取上传原名（稳定 → 重复导出可去重）；data: URI 按内容哈希（补拍替换后是新内容→新文件名，重导不产生副本）；非法字符兜底替换 */
function fileNameFor(src: string): string {
  if (src.startsWith('data:')) return `photo-${shortHash(src)}.jpg`;
  const base = src.split('?')[0].split('/').pop() ?? '';
  const safe = base.replace(/[^A-Za-z0-9._-]/g, '_');
  return safe || `photo-${shortHash(src)}.jpg`;
}

/** 导出指定照片列表到手机公共目录（统计页照片墙分组导出复用）；非 APK 返回 null */
export async function exportPhotoListToPhone(items: { name: string; url: string }[]): Promise<PhotoExportResult | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const result: PhotoExportResult = { dir: '', saved: 0, skipped: 0, failed: 0 };
  if (!items.length) return result;
  const NativePhotoSaver = registerPlugin('NativePhotoSaver') as unknown as NativePhotoSaverProxy;
  const BATCH = 4; // 控制单次桥调用体积（base64 每张 ~数百 KB）
  for (let i = 0; i < items.length; i += BATCH) {
    const batch: { name: string; data: string }[] = [];
    for (let j = i; j < Math.min(i + BATCH, items.length); j++) {
      const data = await toBase64(items[j].url);
      if (!data) {
        result.failed++;
        continue;
      }
      batch.push({ name: items[j].name, data });
    }
    if (!batch.length) continue;
    const r = await NativePhotoSaver.savePhotos({ photos: batch });
    result.dir = r.dir || result.dir;
    result.saved += r.saved;
    result.skipped += r.skipped;
    result.failed += r.failed;
  }
  return result;
}

/** 导出全部照片到手机公共目录；非 APK 返回 null */
export async function exportPhotosToPhone(): Promise<PhotoExportResult | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const urls = await collectPhotoUrls();
  return exportPhotoListToPhone(urls.map((u) => ({ name: fileNameFor(u), url: u })));
}
