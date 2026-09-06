/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8c3JjL3NlcnZpY2VzL2FwaS9hcGkudXNlcnMudHN8MjAyNi0wOXxkNWI4MWY3YWIy */
import { http } from '../http';

/** 用户账号（FR-105：导出/注销） */
export const usersApi = {
  /** 导出全量数据（#25：返回 JSON 字符串，由调用方保存——APK 用文件系统写盘，浏览器下载） */
  exportData: async (): Promise<string> => {
    const res = await http.get<Blob>('/users/me/export', { responseType: 'blob' });
    return (res.data as Blob).text();
  },

  /** 注销账号（软删除 + 数据清理） */
  deleteAccount: () => http.delete<{ success: boolean }>('/users/me').then((r) => r.data),

  /** #3/#17：本地数据导入合并（云端按更新时间较新优先；含设置与离线删除墓碑） */
  importData: (bundle: {
    reminders?: unknown[];
    logs?: unknown[];
    medicines?: unknown[];
    plans?: unknown[];
    posts?: unknown[];
    settings?: unknown;
    deleted?: { reminders: string[]; medicines: string[]; plans: string[] };
  }) => http.post('/users/me/import', bundle).then((r) => r.data),
};
