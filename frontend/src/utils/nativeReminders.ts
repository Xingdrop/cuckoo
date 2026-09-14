/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3V0aWxzL25hdGl2ZVJlbWluZGVycy50c3wyMDI2LTA5fDE1MWY2NTRlZjc= */
import { Capacitor, registerPlugin } from '@capacitor/core';
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

/** 自建原生插件 NativeAlarm（setAlarmClock 调度，见 NativeAlarmPlugin.java） */
interface NativeAlarmApi {
  schedule(opts: {
    id: number;
    title: string;
    body: string;
    at: string;
    rid?: string;
  }): Promise<{ id?: number }>;
  cancel(opts: { id: number }): Promise<void>;
  cancelAll(): Promise<void>;
  list(): Promise<{ ids?: number[] }>;
  consumeLastAlarmId(): Promise<{ alarmId?: number; alarmRid?: string | null }>;
}

/** 自建原生插件 NativeAlarm（setAlarmClock 调度，见 NativeAlarmPlugin.java）——v5+ 必须用 registerPlugin 访问 */
const NativeAlarm = registerPlugin<NativeAlarmApi>('NativeAlarm');

/** 消费最近一次通知点击/全屏意图携带的闹钟信息（app 启动/回前台时调用，取后即清） */
export async function consumeLastAlarm(): Promise<{ alarmId: number; alarmRid: string | null }> {
  if (Capacitor.getPlatform() !== 'android') return { alarmId: -1, alarmRid: null };
  try {
    const r = await NativeAlarm.consumeLastAlarmId();
    return { alarmId: Number(r.alarmId ?? -1), alarmRid: r.alarmRid ?? null };
  } catch {
    return { alarmId: -1, alarmRid: null };
  }
}

/** 稳定字符串哈希 → 32 位正整数（通知 id 要求 int） */
function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

let lastFp = '';
let inFlight = false;

/** 确保渠道存在 + 通知权限已授（返回是否可用）；App 启动即调，避免首次排程时才弹权限 */
async function ensureChannelAndPermission(): Promise<boolean> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') {
    const req = await LocalNotifications.requestPermissions();
    if (req.display !== 'granted') return false;
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
  return true;
}

/**
 * #10（2026-09-09）：App 启动即初始化通知渠道 + 权限——
 * 此前权限请求埋在首次排程里，用户一旦忽略/拒绝系统弹窗，后台通知就永远静默失效。
 * 权限被拒 → 广播 cuckoo:notify-perm-denied（App 层展示一次性提示，引导去系统设置开启）。
 */
export async function initNativeNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const ok = await ensureChannelAndPermission();
    if (!ok) window.dispatchEvent(new CustomEvent('cuckoo:notify-perm-denied'));
  } catch {
    // 初始化失败静默（前台调度引擎仍在工作）
  }
}

/** 全量重排未来 24h 的本地通知（内容不变则跳过） */
export async function syncNativeSchedule(list: Reminder[]): Promise<void> {
  if (!Capacitor.isNativePlatform() || inFlight) return;
  const now = Date.now();
  interface Item {
    id: number;
    title: string;
    body: string;
    at: number;
    reminderId: string;
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
      reminderId: r.id,
    });
  }
  // 指纹去重：同一批触发点只排一次
  const fp = items.map((i) => `${i.id}:${i.at}`).sort().join('|');
  if (fp === lastFp) return;
  inFlight = true;
  try {
    const ok = await ensureChannelAndPermission();
    if (!ok) return;
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    // 2026-09-09 闹钟根治：ColorOS 在 AlarmManager 服务层把 setExactAndAllowWhileIdle
    // 静默放宽为 1h 窗口（插件自报 granted 但 dumpsys windowLength=3600000，已实锤）。
    // Android 原生一律走 NativeAlarm（setAlarmClock，豁免 Doze/OEM 降级）。
    // 旧插件残留闹钟清理（切换前排的 exact/inexact 闹钟），防止双轨重复弹
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }
    if (Capacitor.getPlatform() === 'android') {
      await NativeAlarm.cancelAll();
      for (const i of items) {
        await NativeAlarm.schedule({
          id: i.id,
          title: i.title,
          body: i.body,
          at: String(i.at),
          rid: i.reminderId,
        });
      }
      console.log('[LN] scheduled via NativeAlarm(setAlarmClock):', items.length);
      lastFp = fp;
      return;
    }
    // 非安卓原生回退路径（Web 在函数入口已 return，此分支理论不可达）
    if (items.length) {
      const res = await LocalNotifications.schedule({
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
      // v8.3：schedule 若回退为 inexact 闹钟会带 warning 字段
      console.log('[LN] scheduled:', items.length, 'warning:', JSON.stringify((res as { warning?: unknown }).warning));
    }
    lastFp = fp;
  } catch {
    // 排程失败静默（前台调度引擎仍在工作）
  } finally {
    inFlight = false;
  }
}
