/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvZTJlL3NvY2lhbC5zcGVjLnRzfDIwMjYtMDl8YzhkN2YyY2JhZg== */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { sharedState } from './helpers';

const API = process.env.API ?? 'http://localhost:3000/api/v1';
const uniq = () => `e2e${Date.now() % 100000000}`;
const PASSWORD = 'password123';

async function registerPage(page: Page, username: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await page.fill('#username', username);
  await page.fill('#password', PASSWORD);
  await page.fill('#confirm', PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/today/);
}

test('E2E-06 发计划帖 → 另一账号一键加入 → 人数 +1', async ({ page, request }) => {
  // 账号 A：复用全局共享账号发计划帖（避免每次运行额外注册触发 5 次/分限流）
  const tokenA = sharedState().token;
  const postRes = await request.post(`${API}/posts`, {
    headers: { Authorization: `Bearer ${tokenA}` },
    data: {
      content: 'E2E 一键加入计划帖',
      type: 'user_plan',
      planSnapshot: {
        version: 1,
        reminders: [
          { category: 'water', title: 'E2E 喝水', repeatRule: { type: 'daily' }, times: ['09:00'], startTime: '09:00', content: { text: '' } },
        ],
      },
    },
  });
  expect(postRes.ok()).toBeTruthy();
  const postId = (await postRes.json()).id;
  expect(postId).toBeTruthy();

  // 账号 B：页面注册登录 → 帖子详情 → 一键加入 → 人数显示 1
  await registerPage(page, uniq());
  await page.goto(`/posts/${postId}`);
  await page.getByRole('button', { name: /一键加入/ }).click();
  await expect(page.getByText(/1 人已加入/)).toBeVisible();
});
