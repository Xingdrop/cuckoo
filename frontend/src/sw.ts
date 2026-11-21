/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3N3LnRzfDIwMjYtMTF8NTA1MjRiMWU2OA== */
/// <reference lib="webworker" />
/**
 * 布谷自定义 Service Worker（FR-204/FR-802 通道 B）。
 * - precache 静态资源 + /api GET NetworkFirst（与旧 generateSW 配置等价的运行时缓存）
 * - push：接收后端 web-push 载荷 {title, body, url} → showNotification（页面关闭也能收到提醒）
 * - notificationclick：聚焦现有窗口或打开对应页面
 */
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// 页面导航 NetworkFirst：每次都先取最新 index.html（拿到新 bundle），断网时回退缓存
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({ cacheName: 'cuckoo-pages', networkTimeoutSeconds: 3 }),
);

// /api GET NetworkFirst（保留原 generateSW 的运行时缓存策略）
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({ cacheName: 'cuckoo-api', networkTimeoutSeconds: 5 }),
  'GET',
);

/**
 * 导航兜底：SPA 深链（如 /pomodoro）未在本次 SW 接管后被访问过时，运行时缓存里没有它，
 * 断网会直接掉到浏览器错误页。这里统一回退预缓存的 index.html（App Shell），
 * 交给前端路由按当前 URL 渲染对应页面。
 */
setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') {
    const shell = await matchPrecache('/index.html');
    if (shell) return shell;
  }
  return Response.error();
});

interface PushPayloadData {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

/** 推送到达 → 系统通知 */
self.addEventListener('push', (event) => {
  let data: PushPayloadData = {};
  try {
    data = (event.data?.json() ?? {}) as PushPayloadData;
  } catch {
    data = { title: '布谷', body: event.data?.text() ?? '' };
  }
  const title = data.title || '布谷提醒';
  const options = {
    body: data.body ?? '',
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    data: { url: data.url ?? '/today' },
    tag: data.tag ?? `cuckoo-${data.url ?? 'generic'}`,
    vibrate: [200, 100, 200],
    requireInteraction: true,
  } as NotificationOptions;
  event.waitUntil(self.registration.showNotification(title, options));
});

/** 点击通知 → 聚焦/打开对应页面 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data as { url?: string } | undefined)?.url ?? '/today';
  const resolved = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        await client.focus();
        if (client.url !== resolved) {
          await client.navigate(resolved);
        }
        return;
      }
      await self.clients.openWindow(resolved);
    })(),
  );
});
