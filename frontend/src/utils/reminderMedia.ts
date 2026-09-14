/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3V0aWxzL3JlbWluZGVyTWVkaWEudHN8MjAyNi0wOXw4ZWI3YTg4NTlm */ */
/**
 * 提醒媒体（图片/视频）合并与上限。
 *
 * 上限与后端 ReminderContentDto 对齐：imageUrls ≤ 9（@ArrayMaxSize(9)）、videoUrl 单条。
 * 2026-09-14 修复：此前编辑页用 `[...prev.slice(0, 3), url]` 合并，加第 5 张时会静默丢弃
 * 已添加的那张（既非"丢弃最新"也非"丢弃最旧"），且上限 4 与后端 9 不一致。
 */

export const MAX_IMAGES = 9;
export const MAX_VIDEOS = 1;

/** 合并媒体列表并施加上限；图片在前、视频在后（与保存时 imageUrls / videoUrl 拆分一致） */
export function mergeMedia(
  prev: string[],
  added: string[],
  isVideo: (u: string) => boolean,
): string[] {
  const merged = [...prev, ...added];
  return [
    ...merged.filter((u) => !isVideo(u)).slice(0, MAX_IMAGES),
    ...merged.filter(isVideo).slice(0, MAX_VIDEOS),
  ];
}

/** 合并后是否有内容被上限丢弃（用于给出"超出的已忽略"提示） */
export function mediaOverflow(
  prev: string[],
  added: string[],
  isVideo: (u: string) => boolean,
): { images: boolean; videos: boolean } {
  const merged = [...prev, ...added];
  return {
    images: merged.filter((u) => !isVideo(u)).length > MAX_IMAGES,
    videos: merged.filter(isVideo).length > MAX_VIDEOS,
  };
}
