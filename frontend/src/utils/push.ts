import { registerSW } from 'virtual:pwa-register';
import { http } from '../services/http';

/**
 * Web Push 订阅管理（FR-802：页面关闭时提醒兜底）。
 * 流程：注册 SW → 请求通知权限 → PushManager.subscribe(VAPID) → POST /devices
 */

let swReady: Promise<ServiceWorkerRegistration> | null = null;

function getSW(): Promise<ServiceWorkerRegistration> {
  if (!swReady) {
    swReady = new Promise((resolve, reject) => {
      registerSW({ immediate: true, onRegisteredSW: () => undefined });
      if (!('serviceWorker' in navigator)) {
        reject(new Error('当前浏览器不支持 Service Worker'));
        return;
      }
      navigator.serviceWorker.ready.then(resolve, reject);
    });
  }
  return swReady;
}

/** 浏览器是否支持 Push */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export interface PushResult {
  ok: boolean;
  /** 失败原因：unsupported / permission / sw / vapid / error */
  reason?: 'unsupported' | 'permission' | 'sw' | 'vapid' | 'error';
}

/** 订阅 Web Push：返回是否成功及具体原因 */
export async function subscribePush(): Promise<PushResult> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'permission' };

  try {
    const sw = await getSW();
    const { data } = await http.get<{ publicKey: string }>('/push/vapid-key');
    if (!data.publicKey) return { ok: false, reason: 'vapid' }; // 后端未配置 VAPID

    let subscription = await sw.pushManager.getSubscription();
    if (!subscription) {
      subscription = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: data.publicKey,
      });
    }
    const sub = subscription.toJSON() as {
      endpoint: string;
      keys?: { auth?: string; p256dh?: string };
    };
    await http.post('/devices', {
      endpoint: sub.endpoint,
      keysAuth: sub.keys?.auth ?? '',
      keysP256dh: sub.keys?.p256dh ?? '',
      userAgent: navigator.userAgent.slice(0, 300),
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** 失败原因 → 用户可读文案 */
export function pushFailMessage(reason: PushResult['reason']): string {
  switch (reason) {
    case 'unsupported':
      return '当前浏览器不支持推送（需 Chrome/Edge/Safari 等现代浏览器 + HTTPS 或 localhost）';
    case 'permission':
      return '通知权限被拒绝：请点击浏览器地址栏的 🔔 图标允许通知后重试';
    case 'sw':
      return 'Service Worker 注册失败，请刷新页面重试';
    case 'vapid':
      return '服务器推送配置缺失（VAPID 未配置），请联系管理员';
    default:
      return '推送订阅失败，请稍后重试';
  }
}

/**
 * 检测当前是否已订阅 Push。
 * 带超时：dev 下 SW 注册慢/失败时降级返回 false，避免开关永久不可操作。
 */
export async function checkPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const sw = await Promise.race([
      getSW(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SW 注册超时')), 8000),
      ),
    ]);
    const sub = await sw.pushManager.getSubscription();
    return Boolean(sub);
  } catch {
    return false;
  }
}

/** 退订（仅前端退订；服务端订阅清理在 M5 通知中心完善） */
export async function unsubscribePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const sw = await getSW();
  const subscription = await sw.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }
}
