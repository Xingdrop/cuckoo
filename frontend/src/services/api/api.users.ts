import { http } from '../http';

/** 用户账号（FR-105：导出/注销） */
export const usersApi = {
  /** 导出全量数据（JSON 下载） */
  exportData: async () => {
    const res = await http.get<Blob>('/users/me/export', { responseType: 'blob' });
    const disposition = res.headers['content-disposition'] ?? '';
    const match = /filename="?([^";]+)"?/.exec(disposition);
    const filename = match?.[1] ?? `cuckoo-export-${Date.now()}.json`;
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  /** 注销账号（软删除 + 数据清理） */
  deleteAccount: () => http.delete<{ success: boolean }>('/users/me').then((r) => r.data),

  /** #3/#17：本地数据导入合并（云端按更新时间较新优先；含设置） */
  importData: (bundle: {
    reminders?: unknown[];
    logs?: unknown[];
    medicines?: unknown[];
    plans?: unknown[];
    posts?: unknown[];
    settings?: unknown;
  }) => http.post('/users/me/import', bundle).then((r) => r.data),
};
