/** 迭代 2 核心逻辑冒烟：#1 退出后再加入 / #10 编辑帖子 / 快照引用 / 已修改标记 */
const API = 'http://localhost:3000/api/v1';
const uniq = () => `it2${Date.now() % 1000000}A`;

async function api(path, opts = {}, token) {
  const tok = opts.token ?? token;
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, data: res.ok ? await res.json() : await res.text() };
}

const a = uniq();
const b = `${uniq()}B`;
const regA = await api('/auth/register', { method: 'POST', body: { username: a, password: 'password123' } });
const tokA = regA.data.token;
const regB = await api('/auth/register', { method: 'POST', body: { username: b, password: 'password123' } });
const tokB = regB.data.token;
console.log('register:', regA.status, regB.status);

// A 发计划帖（先给计划加一条提醒，再引用快照）
const plan = await api('/plans', { method: 'POST', token: tokA, body: { name: '迭代计划' } });
const today = new Date().toISOString().slice(0, 10);
await api('/reminders', {
  method: 'POST', token: tokA,
  body: { category: 'water', title: '计划内喝水', repeatRule: { type: 'daily' }, times: ['08:00'], startDate: today, content: { text: '' }, planId: plan.data.id },
});
const snap = await api(`/plans/${plan.data.id}/snapshot`, {}, tokA);
const post = await api('/posts', {
  method: 'POST', token: tokA,
  body: { content: '迭代2计划帖', type: 'user_plan', planSnapshot: snap.data },
});
const postId = post.data.id;
console.log('post with snapshot:', post.status, 'reminders:', snap.data.reminders?.length, 'from:', snap.data.from?.name);

// #1 B join -> leave -> join again（此前会 UNIQUE 冲突）
const j1 = await api(`/posts/${postId}/join`, { method: 'POST', token: tokB });
const l1 = await api(`/posts/${postId}/join`, { method: 'DELETE', token: tokB });
const j2 = await api(`/posts/${postId}/join`, { method: 'POST', token: tokB });
console.log('join→leave→join:', j1.status, l1.status, j2.status, JSON.stringify(j2.data));
const after = await api(`/posts/${postId}`, {}, tokB);
console.log('joinedCount after rejoin:', after.data.joinedCount, 'myJoined:', after.data.myJoined);

// #10 编辑帖子（作者）→ updatedAt 变更 + 内容变化
const edit = await api(`/posts/${postId}`, { method: 'PATCH', token: tokA, body: { content: '迭代2计划帖（已修改）' } });
console.log('edit post:', edit.status, 'content:', edit.data.content, 'updated>created:', new Date(edit.data.updatedAt) > new Date(edit.data.createdAt));

// #8 修改标记：B 编辑加入的提醒 → modifiedFromPlan=true
const reminders = await api('/reminders', {}, tokB);
const joined = reminders.data.find((r) => r.planId);
const upd = await api(`/reminders/${joined.id}`, {
  method: 'PUT', token: tokB,
  body: { title: '我改过的提醒', times: ['10:30'] },
});
console.log('update joined reminder:', upd.status, 'modifiedFromPlan:', upd.data.modifiedFromPlan);

// 未授权编辑（非作者）→ 403
const forbidden = await api(`/posts/${postId}`, { method: 'PATCH', token: tokB, body: { content: 'x' } });
console.log('edit by non-author:', forbidden.status, forbidden.data);
