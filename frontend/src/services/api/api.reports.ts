/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8c3JjL3NlcnZpY2VzL2FwaS9hcGkucmVwb3J0cy50c3wyMDI2LTA5fDJjYWQwZTE0N2M= */
import { http } from '../http';
import type { Page } from '../../types';

export type ReportType = 'weekly' | 'monthly';

export interface Report {
  id: string;
  userId: string;
  type: ReportType;
  period: string;
  createdAt: string;
  data: {
    type: ReportType;
    period: string;
    range?: { start: string; end: string };
    overallRate: number;
    overall: { planned: number; done: number; skipped: number; missed: number; rate: number };
    prevOverall?: { planned: number; done: number; rate: number };
    prevRate?: number;
    rateDelta?: number;
    categoryStats: { name: string; planned: number; done: number; rate: number }[];
    bestCategory: string | null;
    bestReminder: { title: string; done: number } | null;
    streakDays: number;
    suggestion: string;
    heatmap?: { date: string; rate: number; done: number; planned: number }[];
    achievements?: unknown[];
  };
}

export const reportsApi = {
  list: (page = 1, pageSize = 20) =>
    http.get<Page<Report>>('/reports', { params: { page, pageSize } }).then((r) => r.data),
  get: (id: string) => http.get<Report>(`/reports/${id}`).then((r) => r.data),
  generate: (type: ReportType) => http.post<Report>('/reports/generate', { type }).then((r) => r.data),
};
