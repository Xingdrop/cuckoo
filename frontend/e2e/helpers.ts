import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 后端 API 基址（默认与 e2e 其余文件保持一致） */
export const API = process.env.API ?? 'http://localhost:3000/api/v1';
export const PASSWORD = 'password123';

/** 生成唯一用户名（现有 e2e 同款写法） */
export const uniq = () => `e2e${Date.now() % 100000000}`;

export interface SharedState {
  username: string;
  token: string;
}

/**
 * 全局共享账号（由 global-setup.ts 注册并写入 test-results/e2e-state.json）。
 * workers:1 下所有 spec 共用，避免每个用例都触发 /auth/register（5 次/分/IP）导致 429。
 */
let cachedState: SharedState | null = null;
export function sharedState(): SharedState {
  if (!cachedState) {
    const file = join(__dirname, '..', 'test-results', 'e2e-state.json');
    cachedState = JSON.parse(readFileSync(file, 'utf8')) as SharedState;
  }
  return cachedState;
}

/** 带鉴权的请求头 */
export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** 今天 09:00（本地时间）ISO，参考 reminders.spec.ts E2E-02 的 today0900 写法 */
export function today0900Iso(): string {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/**
 * 通过注入 localStorage token 建立已登录页面会话（不调用 /auth/login，规避登录限流）。
 * 相比真实登录，仅在测试需要"页面登录"用例（E2E-03/07/09）之外使用。
 */
export async function pageAuth(page: Page, token: string) {
  await page.goto('/login');
  await page.evaluate((t) => localStorage.setItem('cuckoo_token', t), token);
  await page.goto('/today');
  await expect(page).toHaveURL(/\/today/);
}

/** 真实 UI 登录（满足"页面登录"用例；调用 /auth/login，与注册分开限流） */
export async function pageLogin(page: Page, username: string) {
  await page.goto('/login');
  await page.fill('#username', username);
  await page.fill('#password', PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/today/);
}

/** 真实 UI 注册（Existing/特殊用例使用；调用 /auth/register） */
export async function registerPage(page: Page, username: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await page.fill('#username', username);
  await page.fill('#password', PASSWORD);
  await page.fill('#confirm', PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/today/);
}

/** 注册（API），若 409 则登录复用；返回 token */
export async function ensureUser(request: APIRequestContext, username: string): Promise<string> {
  const reg = await request.post(`${API}/auth/register`, { data: { username, password: PASSWORD } });
  if (reg.ok()) return (await reg.json()).token;
  const login = await request.post(`${API}/auth/login`, { data: { username, password: PASSWORD } });
  if (login.ok()) return (await login.json()).token;
  throw new Error(`ensureUser 失败: register=${reg.status()} login=${login.status()}`);
}

/** 创建 daily 提醒（category 可指定），返回提醒对象 */
export async function createDailyReminder(
  request: APIRequestContext,
  token: string,
  data: {
    category: 'water' | 'exercise' | 'medication' | 'rest' | 'work' | 'custom';
    title: string;
    times?: string[];
    medicineId?: string;
    challenge?: { enabled?: boolean; allowGallery?: boolean };
  },
): Promise<{ id: string; category: string; title: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const body = {
    category: data.category,
    title: data.title,
    repeatRule: { type: 'daily' },
    startDate: today,
    times: data.times ?? ['09:00'],
    content: { text: '' },
    ...(data.medicineId ? { medicineId: data.medicineId } : {}),
    ...(data.challenge ? { challenge: data.challenge } : {}),
  };
  const res = await request.post(`${API}/reminders`, {
    headers: authHeaders(token),
    data: body,
  });
  expect(res.ok()).toBeTruthy();
  const rem = await res.json();
  return { id: rem.id, category: rem.category, title: rem.title };
}
