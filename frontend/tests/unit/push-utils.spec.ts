/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvdGVzdHMvdW5pdC9wdXNoLXV0aWxzLnNwZWMudHN8MjAyNi0wOXxjMjUxNDE5NDY0 */ */
import { describe, expect, it } from 'vitest';
import { urlBase64ToUint8Array } from '../../src/utils/push-utils';

describe('push-utils（VAPID key 转换）', () => {
  it('base64url → Uint8Array（标准示例 key）', () => {
    const key =
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(65); // P-256 公钥 65 字节
    expect(bytes[0]).toBe(4); // 未压缩点前缀
  });

  it('自动补齐 padding（长度非 4 倍数）', () => {
    // "aGVsbG8" 去掉填充的 base64url = hello
    const bytes = urlBase64ToUint8Array('aGVsbG8');
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
  });

  it('带 `-`/`_` 的 base64url 正确解码（Hello World = 11 字节）', () => {
    const bytes = urlBase64ToUint8Array('SGVsbG8gV29ybGQ');
    expect(bytes.length).toBe(11);
    expect(bytes[0]).toBe(72); // 'H'
  });
});
