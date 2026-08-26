import { remindersApi } from '../services/api/api.reminders';
import { useGuestStore } from './guestStore';

/**
 * #15：登录成功后缓存离线镜像（提醒列表 → 本地；断网时复用本地适配层读写，
 * 联网后由 App 的 SyncOnOnline 组件自动把镜像变更合并回远端）。
 */
export async function cacheMirrorData(): Promise<void> {
  try {
    const list = await remindersApi.list();
    const store = useGuestStore.getState();
    // 镜像覆盖（以服务端为准刷新本地）；游客数据不受影响
    store.setMirror('online');
    useGuestStore.setState({
      reminders: list.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category, // ReminderCategory → string
        times: (r.times ?? []).length ? [...(r.times ?? [])] : [],
        startDate: (r.startDate ?? new Date().toISOString()).slice(0, 10),
        createdAt: r.createdAt ?? new Date().toISOString(),
        isActive: r.isActive,
      })),
    });
  } catch {
    /* 离线/失败时保留旧镜像 */
  }
}

/** 联网后：把离线镜像期间的变更导入远端（按 created_at 较新合并），成功则清镜像 */
export async function syncMirrorToCloud(): Promise<boolean> {
  const store = useGuestStore.getState();
  if (store.mirrorOf === null) return false;
  try {
    const { usersApi } = await import('../services/api/api.users');
    await usersApi.importData(store.exportBundle());
    store.clearMirror();
    return true;
  } catch {
    return false;
  }
}
