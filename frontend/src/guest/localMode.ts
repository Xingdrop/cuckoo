/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL2d1ZXN0L2xvY2FsTW9kZS50c3wyMDI2LTA5fGVjNDg2YmViZjg= */ */
import { useGuestStore } from './guestStore';
import { useConnectionStore } from '../stores/connectionStore';

/**
 * 本地数据模式判断（#17）：
 * - 游客模式（active）
 * - 离线镜像（mirrorOf 非空）且（种子账户 或 服务器不可达）
 * 满足时 api 层全部走本地适配层（guestApi）——离线优先架构。
 */
/** 当前是否处于本地数据模式（游客 / 离线镜像） */
export const useLocal = (): boolean => {
  const g = useGuestStore.getState();
  return (
    g.active ||
    (g.mirrorOf !== null &&
      (g.mirrorOf.startsWith('seed:') || !useConnectionStore.getState().online))
  );
};

/** 当前是否处于「游客模式」（本地账户，无账户） */
export const useGuestMode = (): boolean => useGuestStore.getState().active;
