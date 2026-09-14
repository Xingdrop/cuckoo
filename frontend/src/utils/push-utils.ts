/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3V0aWxzL3B1c2gtdXRpbHMudHN8MjAyNi0wOXxjMjFjNjE4MTJi */
/**
 * Web Push 工具纯函数（与浏览器 API 解耦，便于单测）。
 */

/** 将 base64url 字符串转为 Uint8Array<ArrayBuffer>（PushManager.subscribe 的 applicationServerKey 需要 BufferSource） */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = globalThis.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
