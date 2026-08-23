/**
 * UI 全页面截图脚本（M5 视觉门禁，390×844）。
 * 用法（在 frontend/ 目录下运行，以便解析 frontend/node_modules 的 playwright）：
 *   node ../tools/scripts/capture-ui.mjs [输出目录，默认 tools/screenshots/m5]
 * 前置：后端 :3000、前端 :5173 已启动。
 * 流程：API 准备数据（提醒/周报/成就/帖子）→ 浏览器登录 → 逐路由截图（含测试提醒弹窗）。
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('@playwright/test');

const BASE = process.env.BASE ?? 'http://localhost:5173';
const API = process.env.API ?? 'http://localhost:3000/api/v1';
const OUT = process.argv[2] ?? join('tools', 'screenshots', 'm5');

const username = `ui${Date.now() % 1000000}`;
const password = 'password123';

async function api(path, opts = {}, token) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    console.warn(`[api warn] ${opts.method ?? 'GET'} ${path} → ${res.status} ${await res.text().catch(() => '')}`);
  }
  return { status: res.status, data: res.ok ? await res.json() : null };
}

async function prepareData() {
  let reg = await api('/auth/register', { method: 'POST', body: { username, password } });
  if (!reg.data) {
    reg = await api('/auth/login', { method: 'POST', body: { username, password } });
  }
  const token = reg.data.token;
  // 建喝水提醒（每日 09:00）
  const rem = await api('/reminders', {
    method: 'POST',
    token,
    body: {
      category: 'water',
      title: '喝水提醒',
      repeatRule: { type: 'daily' },
      startDate: new Date().toISOString().slice(0, 10),
      times: ['09:00'],
      content: { text: '多喝水，保持状态' },
    },
  });
  if (rem.data?.id) {
    const next = rem.data.nextTriggerAt;
    if (next) {
      await api(`/reminders/${rem.data.id}/ack`, {
        method: 'POST',
        token,
        body: { status: 'completed', scheduledTime: next },
      });
    }
  }
  // 微运动加入计划不需要；生成周报 + 成就检查 + 发帖
  await api('/reports/generate', { method: 'POST', token, body: { type: 'weekly' } });
  await api('/reports/generate', { method: 'POST', token, body: { type: 'monthly' } });
  await api('/achievements/check', { method: 'GET', token });
  await api('/posts', {
    method: 'POST',
    token,
    body: { content: '🎉 一天一个成就，一起坚持！', type: 'achievement' },
  });
  return { username, password, token };
}

async function shot(page, name, wait = 600) {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`shot: ${name}.png`);
}

const ROUTES = [
  ['login', '/login'],
  ['today', '/today'],
  ['reminders', '/reminders'],
  ['reminder-edit', '/reminders/new'],
  ['medicines', '/medicines'],
  ['medicine-edit', '/medicines/new'],
  ['stats', '/stats'],
  ['pomodoro', '/pomodoro'],
  ['water-settings', '/water-settings'],
  ['exercises', '/exercises'],
  ['social', '/social'],
  ['notifications', '/notifications'],
  ['reports', '/reports'],
  ['achievements', '/achievements'],
  ['settings', '/settings'],
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { username: u, password: p, token } = await prepareData();
  console.log(`prepared user ${u}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  // 1. 登录页（未登录）
  await page.goto(`${BASE}/login`);
  await shot(page, 'login');
  // 2. 登录
  await page.fill('#username', u);
  await page.fill('#password', p);
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=今日', { timeout: 10000 }).catch(() => undefined);

  for (const [name, route] of ROUTES) {
    await page.goto(`${BASE}${route}`);
    await shot(page, name, 800);
  }

  // 报告详情（取列表第一个 id）
  const rep = await api('/reports', { token });
  if (rep.data?.items?.[0]?.id) {
    await page.goto(`${BASE}/reports/${rep.data.items[0].id}`);
    await shot(page, 'report-detail', 900);
  }

  // 帖子详情（取列表第一个 id）
  const posts = await api('/posts', { token });
  if (posts.data?.items?.[0]?.id) {
    await page.goto(`${BASE}/posts/${posts.data.items[0].id}`);
    await shot(page, 'post-detail', 900);
  }

  // 提醒弹窗（设置页“测试提醒”）
  await page.goto(`${BASE}/settings`);
  await page.waitForTimeout(700);
  const testBtn = page.getByText('测试提醒', { exact: true });
  if (await testBtn.count()) {
    await testBtn.click();
    await shot(page, 'reminder-overlay', 700);
  }

  await browser.close();
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ username, time: new Date().toISOString() }, null, 2));
  console.log('done →', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
