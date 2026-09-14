/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvZTJlL29mZmxpbmUuc3BlYy50c3wyMDI2LTA5fDNiZWYyOWM3ZTQ= */ */
import { expect, test } from '@playwright/test';
import { API, authHeaders, createDailyReminder, pageAuth, sharedState } from './helpers';

/**
 * E2E-09 离线恢复：断网时已加载页面保持可用（不崩溃、可交互），恢复网络后数据加载正常。
 * 说明：
 * - ack 失败入队/重放的完整逻辑由前端单测 offline-queue.spec.ts 覆盖；
 * - 真正的离线资源缓存（SW precache）只存在于生产构建（dist），dev 模式不做页面缓存，
 *   因此此处验证"断网稳定性 + 恢复"，生产离线能力以 `npm run build && npm run preview` 人工核验。
 */
test.describe.configure({ mode: 'serial' });

test('E2E-09 断网 → 页面可用 → 恢复后数据正常', async ({ page, context, request }) => {
  const { token } = sharedState();

  await createDailyReminder(request, token, { category: 'water', title: 'E2E-09 离线提醒' });
  await pageAuth(page, token);
  await page.goto('/reminders');
  await expect(page.getByText('E2E-09 离线提醒')).toBeVisible();

  // 断网：已加载页面仍可交互（DOM 查询与无网络依赖的操作正常），不崩溃
  await context.setOffline(true);
  const title = await page.title();
  expect(title).toBeTruthy();
  const visibleText = await page.getByText('提醒', { exact: true }).first().isVisible();
  expect(visibleText).toBe(true);

  // 恢复网络：重新进入页面，数据加载正常
  await context.setOffline(false);
  await page.goto('/reminders');
  await expect(page.getByText('E2E-09 离线提醒')).toBeVisible();
});
