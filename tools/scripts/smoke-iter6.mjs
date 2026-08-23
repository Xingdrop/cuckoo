/** 迭代6 冒烟：喝水达成口径（累计达标 +1 次，不按次数累加） */
const API = 'http://localhost:3000/api/v1';
const uniq = () => `it6${Date.now() % 1000000}A`;

async function api(path, opts = {}, token) {
  const tok = opts.token ?? token;
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, data: res.ok ? await res.json() : await res.text() };
}

const u = uniq();
const reg = await api('/auth/register', { method: 'POST', body: { username: u, password: 'password123' } });
const token = reg.data.token;

// 设喝水目标 1000ml（settings）
await api('/users/me/settings', { method: 'PUT', token, body: { waterGoalMl: 1000 } });

// 每日 1 个计划：喝水提醒 + 锻炼提醒（planned=2）
const today = new Date().toISOString().slice(0, 10);
await api('/reminders', { method: 'POST', token, body: { category: 'water', title: '水', repeatRule: { type: 'daily' }, times: ['09:00'], startDate: today, content: { text: '' } } });
await api('/reminders', { method: 'POST', token, body: { category: 'exercise', title: '锻炼', repeatRule: { type: 'daily' }, times: ['19:00'], startDate: today, content: { text: '' } } });

// 只完成锻炼（done=1/2=50%）
const d1 = await api('/stats/dashboard', {}, token);
console.log('before water: rate=', d1.data.rate, 'planned=', d1.data.planned, 'done=', d1.data.done, '(expect 50%)');

// 手动喝水 3 次 × 400ml（未达标 1000）→ 仍 50%
await api('/stats/water', { method: 'POST', token, body: { amountMl: 400 } });
await api('/stats/water', { method: 'POST', token, body: { amountMl: 400 } });
await api('/stats/water', { method: 'POST', token, body: { amountMl: 200 } });
let d2 = await api('/stats/dashboard', {}, token);
console.log('water 1000ml (达标): rate=', d2.data.rate, 'done=', d2.data.done, d2.data.done === 2 && d2.data.rate === 100 ? 'PASS' : 'FAIL');

// 再加 400ml（超过目标）→ done 仍是 2（只算 1 次）
await api('/stats/water', { method: 'POST', token, body: { amountMl: 400 } });
const d3 = await api('/stats/dashboard', {}, token);
console.log('water 1400ml (超目标): done=', d3.data.done, 'rate=', d3.data.rate, d3.data.done === 2 ? 'PASS (不按次数累加)' : 'FAIL');
