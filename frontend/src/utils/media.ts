/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3V0aWxzL21lZGlhLnRzfDIwMjYtMDl8N2VjYmVkMTM1NA== */ */
/**
 * 图片/媒体前端压缩（#1）：图片在 canvas 中重编码为 webp（≤1600px），
 * 降低上传体积（服务端 sharp 继续二次压缩）；视频不转码（无 ffmpeg），大小校验由后端负责。
 */
export async function compressMediaFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file; // 视频/其它原样返回
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.8),
    );
    bitmap.close();
    if (!blob) return file;
    // 同尺寸图片不再重复转档（误差 <10%）
    if (blob.size >= file.size * 0.9) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' });
  } catch {
    return file; // 非图片（svg 等）或浏览器不支持 → 原样
  }
}

/**
 * 链接识别（#2）：把文本中的 http(s)://… 提取为链接数组。
 * 用于帖子/提醒内容自动可点（跳转外链视频 App 等）。
 */
export function extractLinks(text: string): string[] {
  return text.match(/https?:\/\/[^\s，。【】（）()""'']+/g) ?? [];
}
