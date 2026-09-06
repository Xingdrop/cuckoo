/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvZTJlL2dsb2JhbC1zZXR1cC50c3wyMDI2LTA5fDIwODNiN2UzYmY= */
import { request } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API = process.env.API ?? 'http://localhost:3000/api/v1';
const PASSWORD = 'password123';

/**
 * 全局初始化：仅注册一个共享账号，供全部用例复用。
 * 目的：规避 /auth/register 与 /auth/login 各 5 次/分/IP 的限流——
 * 整个套件共享 127.0.0.1，若每个用例都注册/登录，将触发 429。
 * 共享 token（7 天有效）写入 test-results/e2e-state.json 供各 spec 读取。
 */
export default async function globalSetup() {
  const username = `e2e_shared_${Date.now()}`;
  const ctx = await request.newContext();
  try {
    const reg = await ctx.post(`${API}/auth/register`, { data: { username, password: PASSWORD } });
    if (!reg.ok()) {
      // 极少数情况下用户名已存在（重复运行同毫秒），退化为登录复用
      const login = await ctx.post(`${API}/auth/login`, { data: { username, password: PASSWORD } });
      if (!login.ok()) {
        throw new Error(`globalSetup 认证失败: register=${reg.status()} login=${login.status()}`);
      }
    }
    const body = await reg.json();
    const token = body.token as string;
    if (!token) throw new Error('globalSetup 注册未返回 token');
    const dir = join(__dirname, '..', 'test-results');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'e2e-state.json'), JSON.stringify({ username, token }));
  } finally {
    await ctx.dispose();
  }
}
