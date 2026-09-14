/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvcGxheXdyaWdodC5jb25maWcudHN8MjAyNi0wOXxmOWE5NTZiODE0 */
import { defineConfig } from '@playwright/test';

/**
 * Playwright 配置（E2E-01~10 关键旅程固化，2026-08-29）。
 * 前置：无需手动启动服务——webServer 自动拉起后端（dist，需先 npm run build）与前端 dev。
 * 运行：npm run test:e2e （在 frontend/ 目录）
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // E2E_RATE_LIMIT：仅测试环境放宽登录/注册限流（后端只在 NODE_ENV=test 时读取该变量）。
      // 用 webServer.env 注入而非平台相关的前缀写法，保证 Windows / macOS / Linux 都能跑。
      command: 'node dist/main.js',
      env: { NODE_ENV: 'test', E2E_RATE_LIMIT: '1000' },
      cwd: '../backend',
      port: 3000,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      cwd: '.',
      port: 5173,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
