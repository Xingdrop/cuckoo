/** 新功能冒烟：不定时提醒 / 我的计划 / 关注个人主页 / 评论用户名 */
const API = 'http://localhost:3000/api/v1';
const uniq = () => `sm${Date.now() % 1000000}`;

async function api(path, opts = {}, authToken) {
  const body = opts.body;
  const token = opts.token ?? authToken;
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
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

// 1) 不定时每日提醒
const today = new Date().toISOString().slice(0, 10);
const rem = await api('/reminders', {
  method: 'POST', token: tokA,
  body: { category: 'water', title: '不定时喝水', repeatRule: { type: 'daily' }, startDate: today, content: { text: '记得喝水' } },
});
console.log('untimed reminder created:', rem.status, 'times:', JSON.stringify(rem.data.times));
const cal = await api(`/reminders/calendar?date=${today}`, {}, tokA);
const item = cal.data.find((i) => i.reminderId === rem.data.id);
console.log('calendar untimed flag:', item?.untimed, 'title:', item?.title);

// 2) 我的计划
const plan = await api('/plans', { method: 'POST', token: tokA, body: { name: '晨间计划', description: '每天早上' } });
console.log('plan created:', plan.status, plan.data?.name);
// 给计划加提醒（创建提醒带 planId）
await api('/reminders', {
  method: 'POST', token: tokA,
  body: { category: 'exercise', title: '晨间拉伸', repeatRule: { type: 'daily' }, times: ['07:30'], startDate: today, content: { text: '' }, planId: plan.data.id },
});
const plans = await api('/plans', {}, tokA);
console.log('plans list:', plans.data.length, 'reminderCount:', plans.data[0].reminderCount);
const share = await api(`/plans/${plan.data.id}/share`, { method: 'POST', token: tokA });
console.log('share post:', share.status);
const posts = await api('/posts', {}, tokB);
console.log('community posts:', posts.data?.total);

// 3) 关注 + 个人主页
const profA = await api(`/users/${regA.data.user.id}/profile`, {}, tokB);
console.log('profile A (view B): followers', profA.data.followersCount, 'isFollowing', profA.data.isFollowing);
const follow = await api(`/users/${regA.data.user.id}/follow`, { method: 'POST', token: tokB });
console.log('follow:', follow.status, JSON.stringify(follow.data));
const profA2 = await api(`/users/${regA.data.user.id}/profile`, {}, tokB);
console.log('profile A after follow: followers', profA2.data.followersCount, 'isFollowing', profA2.data.isFollowing);

// 4) 评论用户名
const post = await api('/posts', { method: 'POST', token: tokB, body: { content: '评论测试帖' } });
await api(`/posts/${post.data.id}/comment`, { method: 'POST', token: tokA, body: { content: '沙发！' } });
const comments = await api(`/posts/${post.data.id}/comments`, {}, tokB);
console.log('comment author:', JSON.stringify(comments.data.items[0]?.author), 'content:', comments.data.items[0]?.content);
