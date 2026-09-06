/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3V0aWxzL25hdGl2ZVJlbWluZGVycy50c3wyMDI2LTA5fDE1MWY2NTRlZjc= */
import { Capacitor } from '@capacitor/core';
import type { Reminder } from '../types';

/**
 * #6 APK 非前台也弹提醒（2026-09-07）：
 * Web 调度引擎（useReminderScheduler）依赖 WebView JS 前台运行——APK 退到后台/锁屏即失效。
 * 此处把未来 24h 内的触发点排程为系统本地通知（AlarmManager 精确闹钟），
 * 任何界面/锁屏到点弹出 heads-up 通知，点按回到应用。
 * - 幂等：内容指纹（触发点集合）变化才全量重排（10s 轮询不反复调原生）
 * - 通知 id 由 reminderId+触发时刻稳定哈希，避免重复
 */

/** 提醒分类 emoji（与 DashboardPage CATEGORY_EMOJI 保持一致的子集，避免循环依赖） */
const EMOJI: Record<string, string> = {
  medication: '💊',
  exercise: '🏃',
  water: '💧',
  rest: '😴',
  work: '💼',
  custom: '📌',
};

/** 稳定字符串哈希 → 32 位正整数（通知 id 要求 int） */
function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

let lastFp = '';
let inFlight = false;

/** 全量重排未来 24h 的本地通知（内容不变则跳过） */
export async function syncNativeSchedule(list: Reminder[]): Promise<void> {
  if (!Capacitor.isNativePlatform() || inFlight) return;
  const now = Date.now();
  interface Item {
    id: number;
    title: string;
    body: string;
    at: number;
  }
  const items: Item[] = [];
  for (const r of list) {
    if (!r.isActive || !r.nextTriggerAt) continue;
    const at = new Date(r.nextTriggerAt).getTime();
    if (at <= now || at - now > 86_400_000) continue;
    const text = r.content?.text ?? '';
    items.push({
      id: hashId(`${r.id}@${r.nextTriggerAt}`),
      title: `${EMOJI[r.category] ?? '📌'} ${r.title}`,
      body: text.length > 80 ? `${text.slice(0, 80)}…` : text || '到点啦，点击打开处理',
      at,
    });
  }
  // 指纹去重：同一批触发点只排一次
  const fp = items.map((i) => `${i.id}:${i.at}`).sort().join('|');
  if (fp === lastFp) return;
  inFlight = true;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
    }
    // Android 高优先级通道： heads-up 弹出 + 震动 + 声音
    // Importance/Visibility 为纯类型（数值枚举）：HIGH=4、PUBLIC=1
    if (Capacitor.getPlatform() === 'android') {
      await LocalNotifications.createChannel({
        id: 'cuckoo-reminders',
        name: '提醒',
        description: '布谷提醒弹窗的系统通知',
        importance: 4,
        visibility: 1,
        vibration: true,
        sound: 'default',
      });
    }
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }
    if (items.length) {
      await LocalNotifications.schedule({
        notifications: items.map((i) => ({
          id: i.id,
          title: i.title,
          body: i.body,
          schedule: { at: new Date(i.at), allowWhileIdle: true },
          channelId: 'cuckoo-reminders',
          smallIcon: 'ic_launcher',
          largeIcon: 'ic_launcher',
        })),
      });
    }
    lastFp = fp;
  } catch {
    // 排程失败静默（前台调度引擎仍在工作）
  } finally {
    inFlight = false;
  }
}
