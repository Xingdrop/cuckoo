import { ReminderOverlay } from './ReminderOverlay';
import { useReminderScheduler } from './useReminderScheduler';

/** 全局提醒调度器：挂在 App 路由层，页面打开期间负责本地触发 + 全屏弹窗 */
export function ReminderScheduler() {
  const { active, handleAction } = useReminderScheduler();

  if (!active) return null;
  return <ReminderOverlay reminder={active} onAction={handleAction} />;
}
