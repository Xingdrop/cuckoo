import { expect, test } from '@playwright/test';

const uniq = () => `e2e${Date.now() % 100000000}`;
const PASSWORD = 'password123';

test('E2E-10 注销账号 → 旧会话退出 → 重新登录失败', async ({ page }) => {
  const username = uniq();

  // 注册并登录
  await page.goto('/login');
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await page.fill('#username', username);
  await page.fill('#password', PASSWORD);
  await page.fill('#confirm', PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/today/);

  // 设置页注销（确认弹窗）
  await page.goto('/settings');
  await page.getByRole('button', { name: '注销账号' }).click();
  await page.getByRole('button', { name: '确认注销' }).click();
  await expect(page).toHaveURL(/\/login/);

  // 重新登录应失败（账号已注销：停留在登录页，不会进入 /today；
  // 文案可能是"用户名或密码错误"或受限流/锁定影响的其他提示，不做具体文案断言）
  await page.fill('#username', username);
  await page.fill('#password', PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(4_000);
  expect(page.url()).toContain('/login');
});
