import { http } from '../http';
import { useLocal } from '../../guest/localMode';
import { guestApi } from '../../guest/guestApi';

export interface Exercise {
  id: string;
  name: string;
  steps: string;
  imageUrl: string | null;
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
