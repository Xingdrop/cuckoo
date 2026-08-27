import { remindersApi } from '../services/api/api.reminders';
import { medicinesApi } from '../services/api/api.medicines';
import { plansApi } from '../services/api/api.plans';
import { exercisesApi } from '../services/api/api.exercises';
import { authApi } from '../services/api/api.auth';
import { socialApi, notificationsApi } from '../services/api/api.social';
import { useGuestStore, type GuestReminder } from './guestStore';

/**
 * 本地缓存/同步（#17 离线优先）：
 * - refreshLocalCache()：登录后/联网时把服务端全量数据（含社交缓存）镜像到本地数据集，
 *   断网时所有界面由本地适配层读写（数据 = 断网前收到的快照）
 * - syncMirrorToCloud()：联网恢复 → 本地变更导入远端（按更新时间较新合并）+ 重新拉取镜像
 */
export async function refreshLocalCache(): Promise<boolean> {
  if (useGuestStore.getState().mirrorOf === null) return false;
  try {
    const [reminders, medicines, plans, settings, feed, templates, groups, notifications, exercises] =
      await Promise.allSettled([
        remindersApi.list(),
        medicinesApi.list(),
        plansApi.list(),
        authApi.getSettings(),
        socialApi.listPosts(1, 100),
        socialApi.templates(),
        socialApi.groups(),
        notificationsApi.list(),
        exercisesApi.list(),
      ]);
    const patch: Record<string, unknown> = {};
    if (reminders.status === 'fulfilled') {
      patch.reminders = reminders.value.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        categoryLabel: r.categoryLabel ?? null,
        categoryIcon: r.categoryIcon ?? null,
        times: (r.times ?? []).length ? [...(r.times ?? [])] : [],
        startDate: (r.startDate ?? new Date().toISOString()).slice(0, 10),
        startHour: (r.startDate ?? '').slice(11, 16) || undefined,
        createdAt: r.createdAt ?? new Date().toISOString(),
        updatedAt: r.updatedAt ?? r.createdAt ?? new Date().toISOString(),
        isActive: r.isActive,
        repeatRule: r.repeatRule as GuestReminder['repeatRule'],
        content: r.content as Record<string, unknown>,
        planId: r.planId ?? null,
        planName: r.planName ?? null,
        medicineId: r.medicineId ?? null,
      }));
    }
    if (medicines.status === 'fulfilled') patch.medicines = medicines.value;
    if (plans.status === 'fulfilled') patch.plans = plans.value;
    if (settings.status === 'fulfilled') patch.settings = settings.value;
    if (feed.status === 'fulfilled') patch.feed = feed.value.items;
    if (templates.status === 'fulfilled') patch.templates = templates.value;
    if (groups.status === 'fulfilled') patch.groups = groups.value;
    if (exercises.status === 'fulfilled') patch.exercises = exercises.value;
    if (notifications.status === 'fulfilled') {
      patch.notifications = notifications.value.items;
    }
    useGuestStore.setState(patch as never);
    useGuestStore.getState().saveNow();
    return true;
  } catch {
    return false;
  }
}

/**
 * 联网恢复：把离线镜像期间的变更导入远端（按更新时间较新合并），
 * 成功后重新拉取全量镜像（server 为准），并标记 mirror='online'。
 */
export async function syncMirrorToCloud(): Promise<boolean> {
  const store = useGuestStore.getState();
  if (store.mirrorOf === null) return false;
  try {
    const { usersApi } = await import('../services/api/api.users');
    await usersApi.importData(store.exportBundle());
    const refreshed = await refreshLocalCache();
    if (refreshed) store.setMirror('online');
    return refreshed;
  } catch {
    return false;
  }
}
