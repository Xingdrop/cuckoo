/** 迭代5 冒烟：#2 leave 后 myJoined=false（删除 JOIN 互动）/ 视频上传直存 */
const API = 'http://localhost:3000/api/v1';
const uniq = () => `it5${Date.now() % 1000000}`;

async function api(path, opts = {}, token) {
  const tok = opts.token ?? token;
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, data: res.ok ? await res.json() : await res.text() };
}

const a = `${uniq()}A`;
const b = `${uniq()}B`;
const regA = await api('/auth/register', { method: 'POST', body: { username: a, password: 'password123' } });
const tokA = regA.data.token;
const regB = await api('/auth/register', { method: 'POST', body: { username: b, password: 'password123' } });
const tokB = regB.data.token;
console.log('register:', regA.status, regB.status);

// A 发带计划帖
const plan = await api('/plans', { method: 'POST', token: tokA, body: { name: '迭代5计划' } });
const today = new Date().toISOString().slice(0, 10);
await api('/reminders', {
  method: 'POST', token: tokA,
  body: { category: 'water', title: '计划水', repeatRule: { type: 'daily' }, times: ['08:00'], startDate: today, content: { text: '' }, planId: plan.data.id },
});
const snap = await api(`/plans/${plan.data.id}/snapshot`, {}, tokA);
const post = await api('/posts', {
  method: 'POST', token: tokA,
  body: { content: '迭代5帖子', type: 'user_plan', planSnapshot: snap.data },
});
const postId = post.data.id;

// B join → leave → getPost myJoined
await api(`/posts/${postId}/join`, { method: 'POST', token: tokB });
const afterJoin = await api(`/posts/${postId}`, {}, tokB);
console.log('after join: myJoined=', afterJoin.data.myJoined, 'count=', afterJoin.data.joinedCount);
const left = await api(`/posts/${postId}/join`, { method: 'DELETE', token: tokB });
const afterLeave = await api(`/posts/${postId}`, {}, tokB);
console.log('leave status:', left.status, '→ after leave: myJoined=', afterLeave.data.myJoined, 'count=', afterLeave.data.joinedCount, afterLeave.data.myJoined === false && afterLeave.data.joinedCount === 0 ? 'PASS' : 'FAIL');

// 再次 join（循环完整）
const re = await api(`/posts/${postId}/join`, { method: 'POST', token: tokB });
const afterRe = await api(`/posts/${postId}`, {}, tokB);
console.log('re-join:', re.status, 'myJoined=', afterRe.data.myJoined, 'count=', afterRe.data.joinedCount, afterRe.data.myJoined === true && afterRe.data.joinedCount === 1 ? 'PASS' : 'FAIL');

// 视频上传（1KB 假 mp4：无魔数校验，验证直存链路）
const fd = new FormData();
fd.append('file', new Blob([new Uint8Array(1024).fill(0x66)], { type: 'video/mp4' }), 'demo.mp4');
const upRes = await fetch(`${API}/files/upload`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${tokA}` },
  body: fd,
});
const up = await upRes.json();
console.log('video upload:', upRes.status, 'type=', up.type, 'url=', up.url, upRes.ok && up.type === 'video' ? 'PASS' : 'FAIL');
