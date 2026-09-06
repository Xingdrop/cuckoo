/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3NlcnZpY2VzL2FwaS9hcGkuZXhlcmNpc2VzLnRzfDIwMjYtMDl8OGRmNTE3MzFmYw== */
import { http } from '../http';
import { useLocal } from '../../guest/localMode';
import { guestApi } from '../../guest/guestApi';

export interface Exercise {
  id: string;
  name: string;
  steps: string;
  imageUrl: string | null;
  /** 跟练组图（2 帧分解动作） */
  imageUrls?: string[] | null;
  videoUrl: string | null;
  durationSeconds: number;
  category: string;
  sortOrder: number;
  isActive: boolean;
}

/** 微运动库（FR-405）——#17 本地模式读缓存 */
export const exercisesApi = {
  list: () =>
    useLocal()
      ? Promise.resolve(guestApi.exercises())
      : http.get<Exercise[]>('/exercises').then((r) => r.data),
};
