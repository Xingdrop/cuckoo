/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvdGVzdHMvdW5pdC9yZW1pbmRlclByZXNldC5zcGVjLnRzfDIwMjYtMDl8YzU0OTBkZmE0Mg== */
import { describe, expect, it } from 'vitest';
import { exerciseReminderPreset, imagesOf } from '../../src/utils/reminderPreset';

/**
 * 2026-09-14 回归防线：「微运动库组图加入计划后只剩一张」。
 *
 * 事故根因：ExercisesPage 的「加入计划」只把 ex.imageUrl（首帧）塞进 preset，
 * 而动作是 imageUrls 多帧组图 → 生成的提醒只剩一张图。
 */
describe('微运动库 → 新建提醒 预填', () => {
  it('组图整体带入（不丢帧）', () => {
    const preset = exerciseReminderPreset({
      name: '20-20-20 眼部放松',
      steps: '每 20 分钟看 20 英尺外 20 秒',
      durationSeconds: 20,
      imageUrl: '/uploads/guide/eye-2020-1.webp',
      imageUrls: ['/uploads/guide/eye-2020-1.webp', '/uploads/guide/eye-2020-2.webp'],
    });
    expect(preset.contentImages).toEqual([
      '/uploads/guide/eye-2020-1.webp',
      '/uploads/guide/eye-2020-2.webp',
    ]);
    expect(preset.title).toBe('20-20-20 眼部放松');
    expect(preset.contentText).toContain('建议时长 20 秒');
  });

  it('三帧组图（深呼吸）也不丢帧', () => {
    const imgs = imagesOf({
      imageUrl: '/g/breathe-1.webp',
      imageUrls: ['/g/breathe-1.webp', '/g/breathe-2.webp', '/g/breathe-3.webp'],
    });
    expect(imgs).toHaveLength(3);
  });

  it('无组图时退回单张 imageUrl；两者都无则空数组', () => {
    expect(imagesOf({ imageUrl: '/g/wrist-1.webp', imageUrls: [] })).toEqual(['/g/wrist-1.webp']);
    expect(imagesOf({ imageUrl: null, imageUrls: null })).toEqual([]);
    expect(imagesOf({ imageUrls: ['', ''] })).toEqual([]);
  });
});
