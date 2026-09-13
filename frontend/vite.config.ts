/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvdml0ZS5jb25maWcudHN8MjAyNi0wOXxhZmZiNzE2NmU3 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // 开发环境也注册 Service Worker（否则 Web Push 订阅在 dev 下不可用）
      devOptions: { enabled: true },
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      // 自定义 SW（src/sw.ts）：处理 push / notificationclick 事件（页面关闭时提醒兜底，FR-210）
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // webp：随包插画（public/guide/*.webp）必须预缓存，否则 PWA 离线时插画全部 404
        globPatterns: ['**/*.{js,css,html,svg,png,webp,webmanifest,ico}'],
      },
      manifest: {
        name: '布谷 Cuckoo',
        short_name: '布谷',
        description: '准时提醒，温柔守护——你的健康生活管家',
        theme_color: '#2E7D6B',
        background_color: '#F7FAF9',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    // #26：0.0.0.0 监听——手机可经 WiFi 局域网访问 PC 上的服务做全流程测试
    host: true,
    // 开发环境代理 API 到后端，避免跨域
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      // #8：/uploads 也需代理（dev 下帖子图片/视频否则 404）
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.spec.ts'],
  },
});
