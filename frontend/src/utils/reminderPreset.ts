/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3V0aWxzL3JlbWluZGVyUHJlc2V0LnRzfDIwMjYtMDl8ZWQyNTExMmQ1MA== */
/**
 * 「微运动库 / 官方计划」→ 新建提醒 的预填映射。
 *
 * 2026-09-14 修复：微运动库动作是**组图**（imageUrls 多帧），此前预填只取首帧 imageUrl，
 * 加入计划后提醒里就只剩一张图。组图必须整体带入。
 */

import type { ReminderCategory } from '../types';

export interface ReminderPreset {
  category?: ReminderCategory;
  title?: string;
  contentText?: string;
  /** 组图（优先） */
  contentImages?: string[];
  /** 单图（兼容旧调用；仅当没有组图时使用） */
  contentImage?: string;
}

/** 取组图：imageUrls 非空用组图，否则退回单张 imageUrl；过滤空值 */
export function imagesOf(source: { imageUrl?: string | null; imageUrls?: string[] | null }): string[] {
  const group = (source.imageUrls ?? []).filter(Boolean);
  if (group.length) return group;
  return source.imageUrl ? [source.imageUrl] : [];
}

/** 微运动库动作 → 新建提醒预填（组图整体带入） */
export function exerciseReminderPreset(ex: {
  name: string;
  steps: string;
  durationSeconds: number;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
}): ReminderPreset {
  return {
    category: 'exercise',
    title: ex.name,
    contentText: `${ex.steps}\n（建议时长 ${ex.durationSeconds} 秒）`,
    contentImages: imagesOf(ex),
  };
}
