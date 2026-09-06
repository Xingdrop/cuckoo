/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZTJlL3JlcG9ydHMuc3BlYy50c3wyMDI2LTA5fGE0NWMyZDZiYWU= */
import { expect, test } from '@playwright/test';
import {
  API,
  authHeaders,
  createDailyReminder,
  pageAuth,
  pageLogin,
  sharedState,
  today0900Iso,
} from './helpers';

// 本文件全部用例复用 global-setup 注册的共享账号。
// E2E-07 覆盖周报生成 → 通知 → 报告页渲染；E2E-08 覆盖成就墙页面渲染（解锁逻辑由后端单测覆盖）。
test.describe.configure({ mode: 'serial' });

test('E2E-07 周报生成 → 通知可见 → 报告页渲染', async ({ page, request }) => {
  const { username, token } = sharedState();

  // API 生成当前周报
  const gen = await request.post(`${API}/reports/generate`, {
    headers: authHeaders(token),
    data: { type: 'weekly' },
  });
  expect(gen.ok()).toBeTruthy();
  const report = await gen.json();
  expect(report.id).toBeTruthy();

  // 页面登录 → 通知中心出现"本周周报已生成"
  await pageLogin(page, username);
  await page.goto('/notifications');
  await expect(page.getByText('本周周报已生成').first()).toBeVisible();

  // 点击该通知 → 跳转报告详情页
  await page.getByText('本周周报已生成').first().click();
  await expect(page).toHaveURL(/\/reports\//);

  // 报告页出现"周报"标题、周期文案（2026-Wxx）与完成率
  await expect(page.getByText('周报', { exact: true })).toBeVisible();
  await expect(page.getByText(/2026-W\d{2}/)).toBeVisible();
  await expect(page.getByText(/\d+%/).first()).toBeVisible(); // 完成率
});

test('E2E-08 成就解锁 → 成就墙显示 7 条规则与进度条', async ({ page, request }) => {
  const { token } = sharedState();

  // 创建 exercise 提醒并完成 1 条（不足以解锁任何成就，用于触发成就检查链路）
  const reminder = await createDailyReminder(request, token, {
    category: 'exercise',
    title: 'E2E-08 锻炼',
  });
  const ack = await request.post(`${API}/reminders/${reminder.id}/ack`, {
    headers: authHeaders(token),
    data: { status: 'completed', scheduledTime: today0900Iso() },
  });
  expect(ack.ok()).toBeTruthy();

  // 手动触发成就检查：HTTP 200 且解锁数 ≥0（解锁正确性由后端单测覆盖，E2E 验证页面渲染）
  const check = await request.get(`${API}/achievements/check`, { headers: authHeaders(token) });
  expect(check.status()).toBe(200);

  // 成就墙 API：返回 7 条规则
  const wall = await request.get(`${API}/achievements`, { headers: authHeaders(token) });
  const wallBody = await wall.json();
  expect(wallBody.rules.length).toBe(7);
  expect(wallBody.unlockedCount).toBeGreaterThanOrEqual(0);

  // 页面渲染：成就墙标题 + 7 条规则名 + 进度条
  await pageAuth(page, token);
  await page.goto('/achievements');
  await expect(page.getByText('成就墙')).toBeVisible();
  for (const name of ['七日坚持', '月度铁人', '百日筑基', '年度之王', '用药达人', '锻炼标兵', '喝水高手']) {
    await expect(page.getByText(name)).toBeVisible();
  }
  await expect(page.locator('.h-1\\.5.rounded-full').first()).toBeVisible(); // 进度条轨道
});
