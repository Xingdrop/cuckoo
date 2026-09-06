/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3NlcnZpY2VzL2FwaS9hcGkuZmlsZXMudHN8MjAyNi0wOXw2OWVkODQwNDNi */
import { http } from '../http';

export interface UploadResult {
  url: string;
  thumbUrl: string | null;
  type: 'image' | 'video';
}

/** 文件上传（拍照打卡/头像/帖子图片与视频） */
export const filesApi = {
  /** 上传图片/视频 → 返回媒体 URL（图片压缩+缩略图；视频直存） */
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return http.post<UploadResult>('/files/upload', fd).then((r) => r.data);
  },
};
