/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvdGVzdHMvdW5pdC9hc3Npc3RhbnRQcmV2aWV3LnNwZWMudHN8MjAyNi0wOXw4Nzg1MjliNTU0 */
import { describe, expect, it } from 'vitest';
import { previewParams } from '../../src/assistant/assistant';

/**
 * 2026-09-14：预案面板「将要做什么」的参数预览。
 * 此前 dryRun 只返回输入标记一步，确认面板看不到真正要执行的动作与参数。
 */
describe('预案参数预览', () => {
  it('常见参数转中文标签', () => {
    expect(previewParams({ title: '喝水', time: '07:00', category: 'water' })).toBe(
      '标题：喝水 · 时间：07:00 · 分类：water',
    );
  });

  it('过滤内部/撤回用参数与空值', () => {
    expect(previewParams({ title: '喝水', at: '123', logId: 'x', id: 'y', photoUrl: 'z', note: '' })).toBe('标题：喝水');
  });

  it('数组值用 / 连接；对象值跳过', () => {
    expect(previewParams({ days: [1, 3, 5] })).toBe('星期：1/3/5');
    expect(previewParams({ repeatRule: { type: 'daily' } })).toBe('');
  });

  it('最多展示 4 项，未知键原样保留', () => {
    expect(previewParams({ a: 1, b: 2, c: 3, d: 4, e: 5 })).toBe('a：1 · b：2 · c：3 · d：4');
  });

  it('空参数返回空串', () => {
    expect(previewParams()).toBe('');
    expect(previewParams({})).toBe('');
  });
});
