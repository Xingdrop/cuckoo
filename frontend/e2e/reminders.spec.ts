import { expect, test } from '@playwright/test';

const uniq = () => `e2e${Date.now() % 100000000}`;
const PASSWORD = 'password123';

/** 在登录页完成注册（切到注册 tab） */
async function register(page, username) {
  await page.goto('/login');
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await page.fill('#username', username);
  await page.fill('#password', PASSWORD);
  await page.fill('#confirm', PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/today/);
}

test('E2E-01 注册 → 创建喝水提醒 → 列表出现', async ({ page }) => {
  await register(page, uniq());

  await page.goto('/reminders/new');
  await page.getByRole('button', { name: /喝水/ }).first().click();
  await page.fill('#title', 'E2E 喝水提醒');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page).toHaveURL(/\/reminders/);
  await expect(page.getByText('E2E 喝水提醒')).toBeVisible();
});

test('E2E-02 看板计数：完成提醒后今日完成率更新', async ({ page, request }) => {
  const username = uniq();
  // 注册（API）+ 建一条"今天 09:00"的喝水提醒（API）
  const reg = await request.post(`${process.env.API ?? 'http://localhost:3000/api/v1'}/auth/register`, {
    data: { username, password: PASSWORD },
  });
  const token = (await reg.json()).token;
  const today = new Date().toISOString().slice(0, 10);
  const rem = await request.post(
    `${process.env.API ?? 'http://localhost:3000/api/v1'}/reminders`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { category: 'water', title: '看板测试', repeatRule: { type: 'daily' }, startDate: today, times: ['09:00'], content: { text: '' } },
    },
  );
  const reminder = (await rem.json());
  // 页面登录（账号已存在，直接登录）
  await page.goto('/login');
  await page.fill('#username', username);
  await page.fill('#password', PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByText('看板测试')).toBeVisible();
  // API 完成（按"今天 09:00"本地时间上报，与今日看板匹配）→ 刷新看板 → 完成率 100%
  const today0900 = new Date();
  today0900.setHours(9, 0, 0, 0);
  await request.post(`${process.env.API ?? 'http://localhost:3000/api/v1'}/reminders/${reminder.id}/ack`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { status: 'completed', scheduledTime: today0900.toISOString() },
  });
  await page.reload();
  await expect(page.getByText('100%')).toBeVisible();
});
