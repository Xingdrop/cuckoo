import { http } from '../http';
import type { Medicine, Page, ReminderLog } from '../../types';

export interface MedicineInput {
  name: string;
  dosage?: string;
  administration?: string;
  stock?: number;
  threshold?: number;
  expiryDate?: string;
  instructions?: string;
  photoUrl?: string;
  deductionPerUse?: number;
  notifyOnLowStock?: boolean;
}

/** 药品 API（FR-301~305, FR-308） */
export const medicinesApi = {
  list: () => http.get<Medicine[]>('/medicines').then((r) => r.data),

  create: (body: MedicineInput) => http.post<Medicine>('/medicines', body).then((r) => r.data),

  update: (id: string, body: Partial<MedicineInput>) =>
    http.put<Medicine>(`/medicines/${id}`, body).then((r) => r.data),

  remove: (id: string) => http.delete(`/medicines/${id}`).then((r) => r.data),

  adjustStock: (id: string, delta: number) =>
    http.patch<Medicine>(`/medicines/${id}/stock`, { delta }).then((r) => r.data),

  /** 手动扣减（PRN 按需记录） */
  deduct: (id: string, quantity: number) =>
    http.post(`/medicines/${id}/deduct`, { quantity }).then((r) => r.data),

  logs: (id: string, page = 1, pageSize = 20) =>
    http.get<Page<ReminderLog>>(`/medicines/${id}/logs`, { params: { page, pageSize } }).then((r) => r.data),
};
