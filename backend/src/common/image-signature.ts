/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvY29tbW9uL2ltYWdlLXNpZ25hdHVyZS50c3wyMDI2LTA5fDE1MzQ5OWZkZjk= */
/**
 * 图片魔数校验（文件上传三重校验之一：扩展名 + MIME + 魔数）。
 * 纯函数便于单测（UT-COMMON-05）；在 sharp 处理前使用，防止伪装扩展名的非图片文件进入后续流程。
 */

/** 校验文件头 12 字节是否为 jpg / png / webp 签名 */
export function hasValidImageSignature(buf: Buffer): boolean {
  if (!buf || buf.length < 12) return false;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return true;
  }
  // WEBP: 'RIFF' .... 'WEBP'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return true;
  }
  return false;
}
