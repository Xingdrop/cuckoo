/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8dGVzdHMvdW5pdC90b21ic3RvbmUuc3BlYy50c3wyMDI2LTA5fDk2MmQ4MzVhZTE= */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGuestStore, recordCloudDelete } from '../../src/guest/guestStore';
import type { GuestReminder } from '../../src/guest/guestStore';

/**
 * 2026-09-06 离线删除墓碑（#15 后续）：
 * 镜像模式下删除 Reminder/Medicine/Plan 必须记录墓碑（deleted），
 * exportBundle 携带墓碑上传，同步成功后 clearTombstones 清空——
 * 否则云端 upsert 合并会把已删除项"复活"。
 */
describe('guestStore 离线删除墓碑', () => {
  beforeEach(() => {
    localStorage.clear();
    useGuestStore.setState({
      active: false,
      owner: null,
      mirrorOf: null,
      reminders: [],
      medicines: [],
      plans: [],
      deleted: { reminders: [], medicines: [], plans: [] },
    });
  });

  const seedReminder = (id: string): GuestReminder => ({
    id,
    title: `提醒${id}`,
    category: 'water',
    categoryLabel: null,
    categoryIcon: null,
    times: ['08:00'],
    startDate: '2026-09-06',
    startHour: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isActive: true,
    countInRate: true,
    repeatRule: { type: 'daily' },
    content: {},
    planId: null,
    planName: null,
    medicineId: null,
  });

  it('镜像模式删除提醒 → 记入墓碑且不重复', () => {
    const s = useGuestStore.getState();
    s.insertReminder(seedReminder('r1'));
    s.insertReminder(seedReminder('r2'));

    useGuestStore.getState().removeReminder('r1');
    useGuestStore.getState().removeReminder('r1'); // 重复删除不叠加

    const st = useGuestStore.getState();
    expect(st.reminders.map((r) => r.id)).toEqual(['r2']);
    expect(st.deleted.reminders).toEqual(['r1']);
  });

  it('删除药品/计划 → 分别记入对应墓碑', () => {
    useGuestStore.setState({
      medicines: [
        { id: 'm1', name: '药', stock: 10, threshold: 3, deductionPerUse: 1, notifyOnLowStock: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never,
      ],
      plans: [
        { id: 'p1', name: '计划', description: '', sourceType: 'self', isActive: true, createdAt: new Date().toISOString(), reminderCount: 0, config: null } as never,
      ],
    });
    useGuestStore.getState().removeMedicine('m1');
    useGuestStore.getState().removePlan('p1');

    const st = useGuestStore.getState();
    expect(st.deleted.medicines).toEqual(['m1']);
    expect(st.deleted.plans).toEqual(['p1']);
  });

  it('exportBundle 携带墓碑；clearTombstones 清空（同步成功后调用）', () => {
    const s = useGuestStore.getState();
    s.insertReminder(seedReminder('r1'));
    useGuestStore.getState().removeReminder('r1');

    const bundle = useGuestStore.getState().exportBundle();
    expect(bundle.deleted?.reminders).toEqual(['r1']);

    useGuestStore.getState().clearTombstones();
    expect(useGuestStore.getState().deleted).toEqual({ reminders: [], medicines: [], plans: [] });
    // 再导出：墓碑已消费，不再携带
    expect(useGuestStore.getState().exportBundle().deleted?.reminders).toEqual([]);
  });

  it('2026-09-07 在线删除（recordCloudDelete）→ 镜像同步移除 + 记墓碑（防重登回灌复活）', () => {
    // 模拟在线账户镜像：mirrorOf='online'，存档里还有上次镜像的旧提醒
    useGuestStore.setState({ owner: { mode: 'online', userId: 'u1' }, mirrorOf: 'online' });
    const s = useGuestStore.getState();
    s.insertReminder(seedReminder('r1'));
    s.insertReminder(seedReminder('r2'));

    // 在线删除走服务器 API 成功后调用（api.reminders.remove 在线分支）
    recordCloudDelete('reminders', 'r1');

    const st = useGuestStore.getState();
    expect(st.reminders.map((r) => r.id)).toEqual(['r2']);
    expect(st.deleted.reminders).toEqual(['r1']);
    // 重登回灌时 exportBundle 携带墓碑 → importData 真删，旧镜像项不会复活
    expect(useGuestStore.getState().exportBundle().deleted?.reminders).toEqual(['r1']);
  });
});
