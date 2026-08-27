import { useGuestStore } from './guestStore';
import { useConnectionStore } from '../stores/connectionStore';

/**
 * 本地数据模式判断（#17）：
 * - 游客模式（active）
 * - 离线镜像（mirrorOf 非空）且（种子账户 或 服务器不可达）
 * 满足时 api 层全部走本地适配层（guestApi）——离线优先架构。
 */
export const useLocal = (): boolean => {
  const g = useGuestStore.getState();
  return (
    g.active ||
    (g.mirrorOf !== null &&
      (g.mirrorOf.startsWith('seed:') || !useConnectionStore.getState().online))
  );
};
