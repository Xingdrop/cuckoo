import { http } from '../http';

export interface UploadResult {
  url: string;
  thumbUrl: string;
}

/** 文件上传（拍照打卡/头像/帖子媒体） */
export const filesApi = {
  /** 上传图片 → 返回压缩图与缩略图 URL */
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return http.post<UploadResult>('/files/upload', fd).then((r) => r.data);
  },
};
