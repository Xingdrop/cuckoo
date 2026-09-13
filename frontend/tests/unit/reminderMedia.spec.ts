import { describe, expect, it } from 'vitest';
import { MAX_IMAGES, mediaOverflow, mergeMedia } from '../../src/utils/reminderMedia';

/**
 * 2026-09-14：提醒媒体合并上限。
 * 事故根因：旧实现 `[...prev.slice(0, 3), url]` 加第 5 张时会静默丢掉已添加的那张，
 * 且前端上限 4 与后端 DTO（imageUrls ≤ 9）不一致。
 */
const isVideo = (u: string) => /\.(mp4|mov|webm)$/i.test(u);
const img = (n: number) => `https://x/i${n}.webp`;
const vid = (n: number) => `https://x/v${n}.mp4`;

describe('提醒媒体合并', () => {
  it('逐步添加不会丢图（旧实现在第 5 张起丢图）', () => {
    let list: string[] = [];
    for (let n = 1; n <= 9; n++) list = mergeMedia(list, [img(n)], isVideo);
    expect(list).toEqual(Array.from({ length: 9 }, (_, i) => img(i + 1)));
  });

  it('图片超 9 张时保留前 9 张并报告超限', () => {
    const over = mediaOverflow([], [img(1), img(2), img(3), img(4), img(5), img(6), img(7), img(8), img(9), img(10)], isVideo);
    expect(over.images).toBe(true);
    expect(mergeMedia([], [img(1), img(2), img(3), img(4), img(5), img(6), img(7), img(8), img(9), img(10)], isVideo)).toHaveLength(MAX_IMAGES);
  });

  it('视频只保留 1 个（content.videoUrl 是单字段）', () => {
    const r = mergeMedia([], [vid(1), vid(2)], isVideo);
    expect(r).toEqual([vid(1)]);
    expect(mediaOverflow([], [vid(1), vid(2)], isVideo).videos).toBe(true);
  });

  it('图片在前、视频在后（与保存时拆分一致）', () => {
    expect(mergeMedia([vid(1)], [img(1), img(2)], isVideo)).toEqual([img(1), img(2), vid(1)]);
  });

  it('未超限时不报超限', () => {
    const over = mediaOverflow([img(1)], [img(2)], isVideo);
    expect(over).toEqual({ images: false, videos: false });
  });
});
