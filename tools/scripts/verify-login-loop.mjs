/** 验证 /login 死循环修复：persist 残留 user + 无 token 场景下页面稳定显示登录表单 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:5173';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
// 模拟：persist 里有 user，但 token 缺失（旧会话残留）
await ctx.addInitScript(() => {
  localStorage.setItem(
    'cuckoo_auth',
    JSON.stringify({ state: { user: { id: 'ghost', username: 'ghost' }, initialized: true }, version: 0 }),
  );
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login?redirect=%2Ftoday`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
const url = page.url();
const formVisible = await page.locator('form button[type="submit"]').isVisible().catch(() => false);
console.log('URL after 4s:', url);
console.log('login form visible:', formVisible);
if (url.includes('/login') && formVisible) {
  console.log('RESULT: PASS — 登录表单稳定显示，无刷新死循环');
} else {
  console.log('RESULT: FAIL —', url);
}
await browser.close();
