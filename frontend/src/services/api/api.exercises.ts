import { http } from '../http';

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

/** 微运动库（FR-405） */
export const exercisesApi = {
  list: () => http.get<Exercise[]>('/exercises').then((r) => r.data),
};
