/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZTJlL21lZGljaW5lcy5zcGVjLnRzfDIwMjYtMDl8NGM0NjEwNTBlZA== */
import { expect, test } from '@playwright/test';
import {
  API,
  authHeaders,
  createDailyReminder,
  pageLogin,
  sharedState,
  today0900Iso,
} from './helpers';

// 本文件全部用例复用 global-setup 注册的共享账号（避免每个用例再触发 /auth/register 5 次/分限流）。
// E2E-03/04/05 覆盖：延迟上报、用药库存-1+预警通知、拍照打卡（API 链路）。
test.describe.configure({ mode: 'serial' });

test('E2E-03 延迟后完成：API 延迟 → 生成 delayed 记录 → 提醒列表可见', async ({ page, request }) => {
  const { username, token } = sharedState();
  // API 创建 daily 提醒（times ['09:00']）
  const reminder = await createDailyReminder(request, token, {
    category: 'water',
    title: 'E2E-03 延迟提醒',
  });

  // 页面登录（真实登录流程）
  await pageLogin(page, username);

  // API 延迟 5 分钟
  const delay = await request.post(`${API}/reminders/${reminder.id}/delay`, {
    headers: authHeaders(token),
    data: { minutes: 5 },
  });
  expect(delay.ok()).toBeTruthy();

  // 断言 logs 中存在 status='delayed' 记录
  const logsRes = await request.get(`${API}/reminders/${reminder.id}/logs`, { headers: authHeaders(token) });
  expect(logsRes.ok()).toBeTruthy();
  const logs = (await logsRes.json()).items as Array<{ status: string }>;
  expect(logs.some((l) => l.status === 'delayed')).toBeTruthy();

  // UI 环节：进入提醒列表看到该提醒
  await page.goto('/reminders');
  await expect(page.getByText('E2E-03 延迟提醒')).toBeVisible();
});

test('E2E-04 用药提醒完成 → 库存-1 → 预警通知', async ({ request }) => {
  const { token } = sharedState();

  // 创建药品：stock 2 / threshold 1 / deductionPerUse 1 / notifyOnLowStock true
  const medRes = await request.post(`${API}/medicines`, {
    headers: authHeaders(token),
    data: { name: 'E2E 维生素', stock: 2, threshold: 1, deductionPerUse: 1, notifyOnLowStock: true },
  });
  expect(medRes.ok()).toBeTruthy();
  const medicine = await medRes.json();
  expect(medicine.id).toBeTruthy();

  // 创建用药提醒（category=medication，关联 medicineId）
  const reminder = await createDailyReminder(request, token, {
    category: 'medication',
    title: 'E2E-04 用药',
    medicineId: medicine.id,
  });

  // 完成当天 09:00（本地 ISO，与看板口径一致）
  const ack = await request.post(`${API}/reminders/${reminder.id}/ack`, {
    headers: authHeaders(token),
    data: { status: 'completed', scheduledTime: today0900Iso() },
  });
  expect(ack.ok()).toBeTruthy();

  // 库存扣减：2 - 1 = 1
  const listRes = await request.get(`${API}/medicines`, { headers: authHeaders(token) });
  const medicines = (await listRes.json()) as Array<{ id: string; stock: number }>;
  const updated = medicines.find((m) => m.id === medicine.id);
  expect(updated?.stock).toBe(1);

  // 预警通知：low_stock
  const notifRes = await request.get(`${API}/notifications`, { headers: authHeaders(token) });
  const notif = await notifRes.json();
  expect((notif.items as Array<{ type: string }>).some((n) => n.type === 'low_stock')).toBeTruthy();
});

test('E2E-05 拍照打卡：challenge_completed 且 photoUrl 非空', async ({ request }) => {
  // 相机 mock 由 API 层验证：拍照 UI 用 filechooser 模拟成本高，故以 ack(photoUrl) 覆盖后端链路。
  const { token } = sharedState();

  // 创建带 challenge.enabled true 的提醒（category water）
  const reminder = await createDailyReminder(request, token, {
    category: 'water',
    title: 'E2E-05 挑战',
    challenge: { enabled: true },
  });
  expect(reminder.id).toBeTruthy();

  // 拍照完成上报
  const ack = await request.post(`${API}/reminders/${reminder.id}/ack`, {
    headers: authHeaders(token),
    data: { status: 'challenge_completed', scheduledTime: today0900Iso(), photoUrl: '/uploads/test.webp' },
  });
  expect(ack.ok()).toBeTruthy();

  // 断言 logs 中存在 challenge_completed 且 photoUrl 非空
  const logsRes = await request.get(`${API}/reminders/${reminder.id}/logs`, { headers: authHeaders(token) });
  const logs = (await logsRes.json()).items as Array<{ status: string; photoUrl: string | null }>;
  const log = logs.find((l) => l.status === 'challenge_completed');
  expect(log).toBeTruthy();
  expect(log!.photoUrl).toBeTruthy();
});
