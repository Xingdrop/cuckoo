/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvY29tbW9uL2ltYWdlLXNpZ25hdHVyZS5zcGVjLnRzfDIwMjYtMDl8YWM1OTE1NzVmMQ== */ */
import { hasValidImageSignature } from './image-signature';

describe('图片魔数校验（UT-COMMON-05）', () => {
  it('JPEG 头（FF D8 FF）→ true', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(hasValidImageSignature(buf)).toBe(true);
  });

  it('PNG 头（89 50 4E 47 ...）→ true', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(hasValidImageSignature(buf)).toBe(true);
  });

  it('WEBP 头（RIFF....WEBP）→ true', () => {
    const buf = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
    expect(hasValidImageSignature(buf)).toBe(true);
  });

  it('伪装扩展名的非图片（如 HTML/文本）→ false', () => {
    const buf = Buffer.from('<!DOCTYPE html><html></html>'.slice(0, 16), 'utf8');
    expect(hasValidImageSignature(buf)).toBe(false);
  });

  it('空/过短 buffer → false', () => {
    expect(hasValidImageSignature(Buffer.alloc(0))).toBe(false);
    expect(hasValidImageSignature(Buffer.from([0xff, 0xd8]))).toBe(false);
    expect(hasValidImageSignature(null as unknown as Buffer)).toBe(false);
  });
});
