/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvdGVzdHMvdW5pdC9ndWlkZU1lZGlhLnNwZWMudHN8MjAyNi0wOXxmMTE1NzcyZmVh */
import { describe, expect, it, vi } from 'vitest';

/** Capacitor 原生判定可控：验证原生端两个地址的分工（服务器→fetch / 随包→<img>） */
const native = { value: false };
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native.value },
}));

import {
  GUIDE_NAMES,
  guideLocalUrl,
  guideName,
  guideServerUrl,
  isBundledGuide,
} from '../../src/utils/guideMedia';

/**
 * 2026-09-14「大量图片丢失」回归防线。
 *
 * 事故根因：GUIDE_NAMES 遗漏了 AI 重绘新增的 8 个插画名（eye-2020-1/2、eye-blink-1/2、
 * eye-care-1、eye-focus-1/2、water-8）→ 这些地址被判为非随包资源 → 回退服务器 http 地址
 * → 被 ColorOS WebView 的混合内容规则拦死，整片图片挂掉。
 * 因此白名单必须与 public/guide 目录严格一致，新增插画漏登记时本单测直接失败。
 */
const ON_DISK = Object.keys(import.meta.glob('../../public/guide/*.webp')).map((p) =>
  p.replace(/^.*\//, '').replace(/\.webp$/i, ''),
);

describe('guideMedia 插画白名单', () => {
  it('GUIDE_NAMES 与 public/guide 目录严格一致（含重绘新增图）', () => {
    const onDisk = [...ON_DISK].sort();
    expect(onDisk.length).toBeGreaterThan(0);
    expect([...GUIDE_NAMES].sort()).toEqual(onDisk);
  });

  it('带版本参数的地址仍能识别（seed 会注入 ?v=）', () => {
    expect(guideName('/uploads/guide/eye-2020-1.webp?v=20260914a')).toBe('eye-2020-1');
    expect(guideName('/uploads/guide/water-8.webp')).toBe('water-8');
    expect(guideName('/uploads/photos/a.jpg')).toBe('');
  });

  it('重绘新增的 8 张被判为随包资源，且解析为同源 /guide 路径', () => {
    const added = [
      'eye-2020-1', 'eye-2020-2', 'eye-blink-1', 'eye-blink-2',
      'eye-focus-1', 'eye-focus-2', 'eye-care-1', 'water-8',
    ];
    for (const n of added) {
      const u = `/uploads/guide/${n}.webp?v=20260914a`;
      expect(isBundledGuide(u)).toBe(true);
      expect(guideLocalUrl(u)).toBe(`/guide/${n}.webp`);
    }
  });

  it('guideLocalUrl 对非插画地址原样返回；guideServerUrl Web 端返回同源相对路径', () => {
    expect(guideLocalUrl('/uploads/photos/a.jpg')).toBe('/uploads/photos/a.jpg');
    expect(guideServerUrl('/uploads/guide/water-8.webp?v=1')).toBe('/uploads/guide/water-8.webp?v=1');
  });

  it('原生端：服务器地址供 fetch（保留 ?v= 绕过缓存），随包路径供 <img>（同源，无混合内容）', () => {
    localStorage.setItem('cuckoo_api_base', 'http://192.168.3.6:3000/');
    native.value = true;
    try {
      const u = '/uploads/guide/eye-2020-1.webp?v=20260914a';
      expect(guideServerUrl(u)).toBe('http://192.168.3.6:3000/uploads/guide/eye-2020-1.webp?v=20260914a');
      expect(guideLocalUrl(u)).toBe('/guide/eye-2020-1.webp');
    } finally {
      native.value = false;
      localStorage.clear();
    }
  });
});
