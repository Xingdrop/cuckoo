import { http } from '../http';
import { useLocal } from '../../guest/localMode';
import { guestApi } from '../../guest/guestApi';
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
  /** #25：多张药品照片（优先于 photoUrl） */
  photoUrls?: string[];
  deductionPerUse?: number;
  notifyOnLowStock?: boolean;
}

/** 药品 API（FR-301~305, FR-308）——#17 本地模式读写本地数据 */
export const medicinesApi = {
  list: () =>
    useLocal() ? Promise.resolve(guestApi.medicines()) : http.get<Medicine[]>('/medicines').then((r) => r.data),

  create: (body: MedicineInput) =>
    useLocal()
      ? Promise.resolve(guestApi.createMedicine(body))
      : http.post<Medicine>('/medicines', body).then((r) => r.data),

  update: (id: string, body: Partial<MedicineInput>) =>
    useLocal()
      ? Promise.resolve(guestApi.updateMedicine(id, body))
      : http.put<Medicine>(`/medicines/${id}`, body).then((r) => r.data),

  remove: (id: string) =>
    useLocal()
      ? Promise.resolve(guestApi.removeMedicine(id))
      : http.delete(`/medicines/${id}`).then((r) => r.data),

  adjustStock: (id: string, delta: number) =>
    useLocal()
      ? Promise.resolve(guestApi.adjustStock(id, delta))
      : http.patch<Medicine>(`/medicines/${id}/stock`, { delta }).then((r) => r.data),

  /** 手动扣减（PRN 按需记录） */
  deduct: (id: string, quantity: number) =>
    useLocal()
      ? Promise.resolve(guestApi.deduct(id, quantity))
      : http.post(`/medicines/${id}/deduct`, { quantity }).then((r) => r.data),

  logs: (id: string, page = 1, pageSize = 20) =>
    useLocal()
      ? Promise.resolve(guestApi.medicineLogs())
      : http.get<Page<ReminderLog>>(`/medicines/${id}/logs`, { params: { page, pageSize } }).then((r) => r.data),
};
