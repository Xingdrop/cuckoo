/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3NlcnZpY2VzL2FwaS9hcGkuYXBwLnRzfDIwMjYtMDl8YjVlNDVkOWU0NA== */ */
import { apiBase, http } from '../http';

export interface AppApkInfo {
  available: boolean;
  sizeBytes?: number;
  updatedAt?: string;
}

/** App 下载（公开接口）：设置页「下载 App」入口 */
export const appApi = {
  info: () => http.get('/app/info').then((r) => r.data as AppApkInfo),
  /** 直接交给 <a download> 走浏览器下载，不走 axios（避免大文件进内存） */
  downloadUrl: () => `${apiBase()}/app/download`,
};
