/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zY3JpcHRzL3NlZWQtZGVtby5janN8MjAyNi0wOXw3MDNmY2FiNmM3 */
/**
 * 演示数据播种脚本（开发 / 自测专用，不随 APK 分发、不入公开产物）
 *
 * 作用：批量创建 12 个仿真账户（用户名统一 `demo_` 前缀，便于识别与批量清理），
 *      为它们生成头像与帖子配图（公开图库真实照片）、合成短视频（ffmpeg），
 *      发布图文帖 / 计划分享帖 / 视频帖，并交叉点赞、收藏、评论、关注、加入官方计划。
 *      注意：配图取自公开图库真实照片，人设里的 imgs 文案仅作「拍摄意图备注」，图库不解析语义。
 *
 * 全部操作走**真实 HTTP 接口**（注册/登录/上传/发帖/互动），因此同时起到接口联调验证作用。
 *
 * 用法：
 *   node scripts/seed-demo.cjs                        # 默认 12 个账户，连本机 3000
 *   node scripts/seed-demo.cjs --base=http://192.168.3.6:3000
 *   node scripts/seed-demo.cjs --accounts=3           # 只造前 3 个（快速验证）
 *   node scripts/seed-demo.cjs --no-video             # 跳过视频合成
 *   node scripts/seed-demo.cjs --password=xxx         # 自定义口令
 *   node scripts/seed-demo.cjs --clean                # 反向操作：清掉这批演示数据
 *
 * --clean：按用户名前缀 `demo_` 批量清理——物理删除账户及其帖子/互动/关注/计划/设置等
 *          关联数据，并删除本机 uploads 下对应的配图与头像文件（含 _thumb 派生文件）。
 *          官方内容（计划模板 / 微运动库 / 敏感词）不受影响。
 *          直接读写本机 SQLite，需在服务器所在机器上执行；不支持 --accounts 局部清理。
 *
 * 幂等性：可重复执行——已注册账户改为登录；**按帖子内容逐条判断**，已发过的帖子跳过；
 *        点赞/收藏/关注先查当前状态再切换；评论仅在帖子评论数为 0 时补。
 *        因此可以分批补齐（例如先 --no-video 跑一遍，ffmpeg 就绪后再跑一遍只补视频帖）。
 *
 * 限流提示：注册/登录 5 次/分钟/IP。批量注册时脚本会自动退避重试；
 *          若想更快，可临时以 `NODE_ENV=test E2E_RATE_LIMIT=1000` 启动后端。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const BASE = arg('base', 'http://localhost:3000').replace(/\/$/, '') + '/api/v1';
const PASSWORD = arg('password', 'Demo@Cuckoo2026');
const LIMIT = Number(arg('accounts', '12'));
const SKIP_VIDEO = argv.includes('--no-video');
const CLEAN = argv.includes('--clean');
const FFMPEG = arg('ffmpeg', '');
const TMP = path.join(os.tmpdir(), 'cuckoo-demo-seed');
fs.mkdirSync(TMP, { recursive: true });

let authCalls = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 仿真人设（用户名 demo_ 前缀 = 标记，测试完可按前缀批量清理）----------
const PERSONAS = [
  {
    user: 'demo_xiaoman',
    name: '林小满',
    goals: ['water', 'sedentary'],
    avatar: 'photorealistic portrait of a friendly 28-year-old Chinese woman office worker, light blue shirt, soft natural window light, plain light gray background, square headshot',
    posts: [
      { text: '坚持记录喝水第 12 天。以前一忙就忘，现在每小时会提醒一次，一天下来终于喝够 1500ml 了。', imgs: ['a glass of water and a stainless water bottle on a tidy office desk, morning sunlight, photorealistic', 'healthy homemade lunch box with greens and brown rice on a wooden table, photorealistic'] },
      { text: '久坐真的伤腰。我给自己定了一个每小时起来动两分钟的计划，坚持一周，下午不那么困了。', imgs: ['a woman doing a gentle shoulder stretch beside an office chair, bright modern office, photorealistic'] },
    ],
    plan: {
      name: '我的喝水计划',
      reminders: [
        { category: 'water', categoryLabel: '喝水', title: '上午补水', times: ['09:30'], text: '喝 200ml 温水' },
        { category: 'water', categoryLabel: '喝水', title: '午后补水', times: ['14:30'], text: '喝 200ml 温水' },
      ],
    },
    video: true,
  },
  {
    user: 'demo_laozhou',
    name: '周建国',
    goals: ['medication', 'water'],
    avatar: 'photorealistic portrait of a 58-year-old Chinese man with short gray hair, glasses, calm expression, plain background, square headshot',
    posts: [
      { text: '给家里老人做的用药提醒。以前总记不清哪顿吃了，现在按点弹窗，还能拍照留档，安心多了。', imgs: ['weekly pill organizer and medicine boxes on a bedside table, soft daylight, photorealistic', 'a cup of warm water and a small pill box on a wooden table, photorealistic'] },
      { text: '血压记录坚持三个月了，把数据导出来给医生看，省了不少沟通时间。', imgs: ['a paper health record notebook with a pen on a desk, photorealistic'] },
    ],
    plan: {
      name: '规律用药计划',
      reminders: [
        { category: 'medication', categoryLabel: '用药', title: '早饭后服药', times: ['08:00'], text: '降压药 1 粒，温水送服' },
        { category: 'medication', categoryLabel: '用药', title: '晚饭后服药', times: ['19:00'], text: '降压药 1 粒，温水送服' },
      ],
    },
  },
  {
    user: 'demo_ayan',
    name: '陈雅',
    goals: ['water', 'sleep'],
    avatar: 'photorealistic portrait of a 32-year-old Chinese woman with long dark hair, warm smile, cozy indoor light, plain background, square headshot',
    posts: [
      { text: '把睡前刷手机换成了泡脚和看几页书，入睡快了很多。早睡计划第 9 天打卡。', imgs: ['cozy bedroom at night with warm bedside lamp and an open book on the bed, photorealistic', 'a cup of herbal tea on a desk with a notebook, warm light, photorealistic'] },
      { text: '睡前两小时不看工作消息，这个小规则对我帮助最大。', imgs: ['a smartphone placed face down on a bedside table at night, photorealistic'] },
    ],
    plan: {
      name: '早睡计划',
      reminders: [
        { category: 'sleep', categoryLabel: '睡眠', title: '准备睡觉', times: ['22:30'], text: '放下手机，泡脚十分钟' },
        { category: 'sleep', categoryLabel: '睡眠', title: '关灯', times: ['23:00'], text: '关灯，做三次深呼吸' },
      ],
    },
  },
  {
    user: 'demo_tiezhu',
    name: '李铁柱',
    goals: ['sedentary', 'water'],
    avatar: 'photorealistic portrait of a 35-year-old Chinese man in a gray t-shirt, short hair, friendly expression, plain background, square headshot',
    posts: [
      { text: '程序员久坐党报到。每小时提醒站起来走两分钟，腰不酸了，晚上也没那么累。', imgs: ['a standing desk setup with a laptop in a bright office, photorealistic', 'a man walking along an office corridor during a break, photorealistic'] },
      { text: '下班后绕小区走三圈，微信步数终于过万了。', imgs: ['evening walk in a residential neighborhood in China, warm street lights, photorealistic'] },
    ],
    plan: {
      name: '久坐提醒计划',
      reminders: [
        { category: 'sedentary', categoryLabel: '久坐', title: '起身活动', repeat: { type: 'interval', minutes: 60 }, text: '站起来走动 2 分钟，转转脖子' },
      ],
    },
    video: true,
  },
  {
    user: 'demo_mumu',
    name: '王沐',
    goals: ['sleep', 'work'],
    avatar: 'photorealistic portrait of a 26-year-old Chinese man with glasses, casual hoodie, soft indoor light, plain background, square headshot',
    posts: [
      { text: '加班到十点也要留 20 分钟给自己。做了个「工作间隙放松」计划，肩颈舒服不少。', imgs: ['a young man doing seated neck stretches at a desk at night, photorealistic', 'a yoga mat rolled out in a small living room, warm light, photorealistic'] },
      { text: '番茄钟 + 拉伸提醒，效率反而更高了。', imgs: ['a desk with a timer, notebook and a glass of water, photorealistic'] },
    ],
    plan: {
      name: '工作间隙放松计划',
      reminders: [
        { category: 'work', categoryLabel: '工作', title: '间隙拉伸', repeat: { type: 'interval', minutes: 90 }, text: '做颈部和肩部拉伸各 1 分钟' },
        { category: 'work', categoryLabel: '工作', title: '远眺放松', times: ['15:00'], text: '看向窗外远处 1 分钟，缓解眼疲劳' },
      ],
    },
  },
  {
    user: 'demo_qingqing',
    name: '赵晴',
    goals: ['water', 'sedentary'],
    avatar: 'photorealistic portrait of a 30-year-old Chinese woman with shoulder-length hair, white blouse, bright office background, square headshot',
    posts: [
      { text: '办公桌上放了个大水杯，看见就喝。一个月下来皮肤状态肉眼可见变好。', imgs: ['a large water bottle with lemon slices on an office desk, photorealistic', 'a woman drinking water at her desk, photorealistic'] },
      { text: '午休后爬两层楼梯，下午不犯困。', imgs: ['an office stairwell with daylight, photorealistic'] },
    ],
    plan: {
      name: '办公室补水计划',
      reminders: [
        { category: 'water', categoryLabel: '喝水', title: '开工第一杯水', times: ['09:00'], text: '到工位先喝一杯水' },
        { category: 'water', categoryLabel: '喝水', title: '下班前补水', times: ['17:30'], text: '喝 200ml 温水' },
      ],
    },
  },
  {
    user: 'demo_dabai',
    name: '吴大白',
    goals: ['medication', 'sedentary'],
    avatar: 'photorealistic portrait of a 45-year-old Chinese man with a beard, denim shirt, plain background, square headshot',
    posts: [
      { text: '陪爸妈一起用提醒，药盒拍照存档这个功能太实用了，复诊时医生直接看记录。', imgs: ['an elderly Chinese couple sitting at a table with a pill organizer, warm light, photorealistic', 'a smartphone showing a photo of a medicine box, held in hand, photorealistic'] },
      { text: '每天晚饭后陪爸妈散步 30 分钟，也是给自己的提醒。', imgs: ['two people walking in a park at dusk, photorealistic'] },
    ],
    plan: {
      name: '家人用药提醒',
      reminders: [
        { category: 'medication', categoryLabel: '用药', title: '早餐后', times: ['08:30'], text: '餐后服药，拍照留档' },
        { category: 'medication', categoryLabel: '用药', title: '睡前', times: ['21:00'], text: '睡前服药，拍照留档' },
      ],
    },
  },
  {
    user: 'demo_nannan',
    name: '孙楠',
    goals: ['work', 'sleep'],
    avatar: 'photorealistic portrait of a 29-year-old Chinese woman with short hair and earrings, casual sweater, plain background, square headshot',
    posts: [
      { text: '远程办公最容易忘记休息。定了每小时 5 分钟的放松提醒，肩颈明显没那么紧了。', imgs: ['a home office desk with a laptop and a small plant, soft daylight, photorealistic', 'a woman stretching her arms overhead at a home desk, photorealistic'] },
      { text: '晚上十一点准时关电脑，坚持两周，白天精神好太多。', imgs: ['a laptop closed on a desk at night with a warm lamp, photorealistic'] },
    ],
    plan: {
      name: '远程办公节奏计划',
      reminders: [
        { category: 'work', categoryLabel: '工作', title: '整点休息', repeat: { type: 'interval', minutes: 60 }, text: '离开椅子活动 5 分钟' },
      ],
    },
  },
  {
    user: 'demo_huihui',
    name: '郑慧',
    goals: ['water', 'medication'],
    avatar: 'photorealistic portrait of a 52-year-old Chinese woman with neat short hair, gentle smile, plain background, square headshot',
    posts: [
      { text: '血糖偏高以后开始认真记录喝水和饮食。提醒帮我养成了习惯，三个月复查指标好看了。', imgs: ['a glass of water, a notebook and a glucose meter on a table, photorealistic', 'a plate of steamed vegetables and fish, home style Chinese meal, photorealistic'] },
      { text: '把计划分享给了老姐妹，她们说比自己记本子方便。', imgs: ['a notebook with handwritten health records and a pen, photorealistic'] },
    ],
    plan: {
      name: '控糖生活计划',
      reminders: [
        { category: 'water', categoryLabel: '喝水', title: '餐前一杯水', times: ['11:30'], text: '餐前喝 200ml 温水' },
        { category: 'medication', categoryLabel: '用药', title: '早餐后服药', times: ['08:00'], text: '按医嘱服药' },
      ],
    },
  },
  {
    user: 'demo_akai',
    name: '何凯',
    goals: ['sedentary', 'water'],
    avatar: 'photorealistic portrait of a 33-year-old Chinese man in sportswear, athletic build, bright background, square headshot',
    posts: [
      { text: '恢复训练第三周。比起猛练，我觉得按时提醒自己去动才是最难的那一步。', imgs: ['a man doing stretching exercises on a yoga mat in a bright room, photorealistic', 'a water bottle and a towel on a gym bench, photorealistic'] },
      { text: '力量训练后一定要补水和拉伸，恢复快很多。', imgs: ['a glass of water beside a pair of dumbbells on the floor, photorealistic'] },
    ],
    plan: {
      name: '训练恢复计划',
      reminders: [
        { category: 'sedentary', categoryLabel: '久坐', title: '训练前热身', times: ['19:00'], text: '动态拉伸 8 分钟' },
        { category: 'water', categoryLabel: '喝水', title: '训练后补水', times: ['20:30'], text: '补充 300ml 水' },
      ],
    },
  },
  {
    user: 'demo_yingzi',
    name: '冯瑛',
    goals: ['sleep', 'water'],
    avatar: 'photorealistic portrait of a 41-year-old Chinese woman with soft curly hair, warm expression, plain background, square headshot',
    posts: [
      { text: '带娃熬夜三年，最近开始给自己定睡眠提醒。先睡好，才有力气照顾家人。', imgs: ['a calm bedroom before sleep with dim warm light and a diffuser, photorealistic', 'a woman sleeping peacefully, soft morning light through curtains, photorealistic'] },
      { text: '晚上喝水改到八点前，起夜少了，睡眠连续性好多了。', imgs: ['a glass of water and a small clock on a bedside table, photorealistic'] },
    ],
    plan: {
      name: '睡眠修复计划',
      reminders: [
        { category: 'sleep', categoryLabel: '睡眠', title: '停止喝水', times: ['20:00'], text: '之后尽量不再大量饮水' },
        { category: 'sleep', categoryLabel: '睡眠', title: '准备入睡', times: ['22:40'], text: '关灯，做深呼吸放松' },
      ],
    },
  },
  {
    user: 'demo_xiaoyu',
    name: '许小雨',
    goals: ['water', 'work'],
    avatar: 'photorealistic portrait of a 24-year-old Chinese woman student, ponytail, light cardigan, plain bright background, square headshot',
    posts: [
      { text: '备考期间最容易忘记喝水。设了提醒以后，一天能喝完两壶，脑子也清醒些。', imgs: ['a study desk with books, notes and a water bottle, daylight, photorealistic', 'a student taking notes at a desk with a cup of water, photorealistic'] },
      { text: '每学 50 分钟站起来走走，效率比硬撑高。', imgs: ['a library reading room with tall windows, quiet atmosphere, photorealistic'] },
    ],
    plan: {
      name: '备考健康计划',
      reminders: [
        { category: 'water', categoryLabel: '喝水', title: '学习间隙补水', repeat: { type: 'interval', minutes: 60 }, text: '喝水并起身活动一下' },
      ],
    },
    video: true,
  },
];

const COMMENTS = [
  '这个提醒设置得好，我也去试试',
  '同款困扰，学到了',
  '已加入你的计划，感谢分享',
  '坚持下来真的不容易，加油',
  '照片拍得很有生活感',
  '请问喝水提醒是每小时一次吗',
  '我也在记录，一起坚持',
  '这个思路对我很有帮助，谢谢',
];

// ---------- HTTP 工具 ----------
async function call(method, url, { token, body, form, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url.startsWith('http') ? url : BASE + url, { method, headers, body: payload });
  if (raw) return res;
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, retryAfter: res.headers.get('retry-after') };
}

/** 带限流退避的调用（注册/登录 5 次/分钟/IP） */
async function callWithBackoff(method, url, opts = {}) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await call(method, url, opts);
    if (r.status !== 429) return r;
    const wait = Number(r.retryAfter ?? 61) * 1000 + 1500;
    console.log(`    限流（429），等待 ${Math.round(wait / 1000)}s 后重试…`);
    await sleep(wait);
  }
  throw new Error(`持续被限流: ${url}`);
}

async function login(username) {
  authCalls++;
  const r = await callWithBackoff('POST', '/auth/login', { body: { username, password: PASSWORD } });
  return r.status === 200 ? r.data : null;
}

async function register(username) {
  authCalls++;
  const r = await callWithBackoff('POST', '/auth/register', { body: { username, password: PASSWORD } });
  if (r.status === 201 || r.status === 200) return r.data;
  throw new Error(`注册失败 ${username}: ${r.status} ${JSON.stringify(r.data)}`);
}

// ---------- 配图来源 + 上传 ----------
// 说明：原打算用 IDE 的文生图接口（text_to_image），但该接口当前对任何提示词都只返回同一张
// 「The image is generating…」占位图（实测 48 张图 MD5 完全一致），故改用公开图库真实照片：
//   头像 = xsgames.co 随机真人肖像（256×256，按人设描述里的性别选目录）
//   配图 = picsum.photos 真实摄影图
// 配图**按图库 id 取**而不是按 seed 取：实测 seed 方式会对不同 seed 返回同一张照片（约 5% 撞图），
// id 则天然互不相同；再叠加内容指纹校验兜底。人设里的 imgs 文案仅作「拍摄意图备注」，图库不解析语义。
const AVATAR_SRC = (persona, idx) => {
  const dir = /woman|girl|female/i.test(persona.avatar) ? 'female' : 'male';
  const n = ((idx * 7 + 3) % 78) + 1;
  return `https://xsgames.co/randomusers/assets/avatars/${dir}/${n}.jpg`;
};

/** 图库可用图片 id（启动时拉一次，排序后按序取用，保证本轮每张都不同） */
const photoIds = [];
let photoCursor = 0;
async function loadPhotoIds() {
  for (let page = 1; page <= 2 && photoIds.length < 100; page++) {
    const res = await fetch(`https://picsum.photos/v2/list?page=${page}&limit=100`);
    if (!res.ok) throw new Error(`图片库列表获取失败 ${res.status}`);
    for (const item of await res.json()) photoIds.push(String(item.id));
  }
  photoIds.sort((a, b) => Number(a) - Number(b));
}
const PHOTO_SRC = (id, portrait) =>
  `https://picsum.photos/id/${id}/${portrait ? '720/1280' : '1200/900'}`;

async function fetchImage(url) {
  // 公开图库偶发超时/限流，重试几次再放弃（失败只影响当前这张，重跑脚本可续上）
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`配图下载失败 ${res.status} ${url}`);
      const type = res.headers.get('content-type') ?? '';
      if (!type.startsWith('image/')) throw new Error(`配图返回非图片内容: ${type}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // 占位图/失败页往往极小，做个下限兜底（正常照片都在数十 KB 以上）
      if (buf.length < 3000) throw new Error(`配图内容过小（${buf.length}B），疑似占位图`);
      return buf;
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr;
}

/** 本轮已用配图的内容指纹——图库偶发对不同 id 返回同一张照片，撞了就顺延取下一张 */
const usedPhotoHashes = new Set();
async function fetchUniquePhoto(portrait = false) {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (photoCursor >= photoIds.length) throw new Error('图库 id 已用尽，请重跑或扩大图片库列表');
    const id = photoIds[photoCursor++];
    const buf = await fetchImage(PHOTO_SRC(id, portrait));
    const h = crypto.createHash('md5').update(buf).digest('hex');
    if (!usedPhotoHashes.has(h)) {
      usedPhotoHashes.add(h);
      return buf;
    }
    console.log(`    图片 ${id} 与已有配图重复，顺延取下一张…`);
  }
  throw new Error('连续取到重复配图');
}

async function upload(buf, filename, mime, token) {
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime }), filename);
  const r = await call('POST', '/files/upload', { token, form });
  if (r.status !== 201 && r.status !== 200) throw new Error(`上传失败 ${filename}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}

// ---------- ffmpeg 短视频 ----------
function findFfmpeg() {
  if (FFMPEG && fs.existsSync(FFMPEG)) return FFMPEG;
  const cands = [
    // 随本机其他软件附带的 ffmpeg（无需额外安装，实测可用）
    path.join(process.env.APPDATA ?? '', 'bilibili', 'ffmpeg', 'ffmpeg.exe'),
  ];
  const pkgs = path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(pkgs)) {
    for (const d of fs.readdirSync(pkgs)) {
      if (!/ffmpeg/i.test(d)) continue;
      const inner = path.join(pkgs, d);
      const walk = (dir, depth) => {
        if (depth > 3) return;
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, f.name);
          if (f.isDirectory()) walk(p, depth + 1);
          else if (f.name === 'ffmpeg.exe') cands.push(p);
        }
      };
      walk(inner, 0);
    }
  }
  for (const c of cands) if (fs.existsSync(c)) return c;
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {
    return null;
  }
}

/** 三张图 → 5 秒 720x1280 竖版 mp4（无音轨，浏览器可直接播放） */
function makeVideo(images, outPath, ffmpeg) {
  const args = ['-y'];
  for (const img of images) args.push('-loop', '1', '-t', '1.8', '-i', img);
  const filters = images.map((_, i) => `[${i}:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1[v${i}]`).join(';');
  const concat = images.map((_, i) => `[v${i}]`).join('') + `concat=n=${images.length}:v=1:a=0[out]`;
  args.push('-filter_complex', `${filters};${concat}`, '-map', '[out]', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '25', outPath);
  execFileSync(ffmpeg, args, { stdio: 'ignore' });
  return fs.existsSync(outPath) && fs.statSync(outPath).size > 1000;
}

// ---------- 业务操作 ----------
const today = new Date().toISOString().slice(0, 10);

function buildSnapshot(plan) {
  return {
    version: 1,
    from: { name: plan.name },
    reminders: plan.reminders.map((r) => ({
      category: r.category,
      categoryLabel: r.categoryLabel,
      title: r.title,
      repeatRule: r.repeat ?? { type: 'daily' },
      times: r.times,
      startDate: today,
      content: { text: r.text },
    })),
  };
}

/** 指向用户的列名白名单（各业务表命名不一，逐一列出；演示数据全部是「用户自有的行」） */
const USER_REF_COLUMNS = [
  'userId',
  'followerId',
  'followingId',
  'senderId',
  'userAId',
  'userBId',
  'appUserId',
  'targetId',
  'ownerId',
  'actorId',
];

/**
 * --clean：反向清理（演示数据彻底移除，官方种子内容保留）
 *
 * 这里走本机 SQLite 直连而不是 HTTP 注销接口：注销只做软删除，会长期占用 username
 * （唯一索引），清理后就无法再用同名账户播种。因此改做物理删除。
 * 官方内容（plan_templates / exercises / sensitive_words）没有任何用户外键，天然不受影响。
 */
async function cleanDemo() {
  const dbFile = path.resolve(__dirname, '..', 'data', 'cuckoo.sqlite');
  console.log(`\n=== 布谷演示数据清理 ===\n数据库: ${dbFile}\n`);
  if (!fs.existsSync(dbFile)) {
    console.log('未找到本机数据库。--clean 需在服务器所在机器上执行（远端服务器请到该机器上跑）。\n');
    process.exitCode = 1;
    return;
  }
  const Database = require('better-sqlite3');
  const db = new Database(dbFile);
  db.pragma('foreign_keys = OFF');

  const users = db.prepare("select id, username, avatarUrl from users where username glob 'demo_*'").all();
  if (!users.length) {
    console.log('没有 demo_ 前缀的演示账户，无需清理。\n');
    db.close();
    return;
  }
  const ids = users.map((u) => u.id);
  const ph = ids.map(() => '?').join(',');
  console.log(`  待清理账户 ${users.length} 个: ${users.map((u) => u.username).join(', ')}`);

  // 收集待删媒体（头像 + 这些账户帖子里的配图/视频）
  const media = new Set(users.map((u) => u.avatarUrl).filter(Boolean));
  const posts = db.prepare(`select id, mediaUrls from posts where userId in (${ph})`).all(...ids);
  const postIds = posts.map((p) => p.id);
  for (const p of posts) {
    try {
      for (const u of JSON.parse(p.mediaUrls ?? '[]')) media.add(u);
    } catch {
      /* 媒体字段异常时跳过 */
    }
  }

  const tables = db
    .prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'")
    .all()
    .map((r) => r.name);

  const tx = db.transaction(() => {
    // 1) 逐表清理所有指向这些账户的行（含双向表 follows 的 followerId / followingId）
    for (const t of tables) {
      if (t === 'users') continue;
      const cols = db.prepare(`pragma table_info("${t}")`).all().map((c) => c.name);
      const refs = USER_REF_COLUMNS.filter((c) => cols.includes(c));
      for (const c of refs) {
        const n = db.prepare(`delete from "${t}" where "${c}" in (${ph})`).run(...ids).changes;
        if (n > 0) console.log(`  清空 ${t}.${c}: ${n} 行`);
      }
      // 2) 指向这些账户帖子的行（interactions 等）
      if (cols.includes('postId') && postIds.length) {
        const ph2 = postIds.map(() => '?').join(',');
        const n = db.prepare(`delete from "${t}" where postId in (${ph2})`).run(...postIds).changes;
        if (n > 0) console.log(`  清空 ${t}.postId: ${n} 行`);
      }
    }
    // 3) 最后删账户本体（物理删除，释放 username）
    const n = db.prepare(`delete from users where id in (${ph})`).run(...ids).changes;
    console.log(`  删除账户行: ${n}`);
  });
  tx();
  db.exec('VACUUM');
  db.close();

  // 4) 删除本机 uploads 下的对应媒体文件（图片另带 _thumb 派生文件）
  const uploadsRoot = path.resolve(__dirname, '..', 'uploads');
  let removedFiles = 0;
  for (const u of media) {
    const file = path.resolve(__dirname, '..', String(u).replace(/^\/+/, ''));
    if (!file.startsWith(uploadsRoot)) continue;
    const thumb = file.replace(/(\.[a-z0-9]+)$/i, '_thumb$1');
    for (const f of [file, thumb]) {
      if (fs.existsSync(f)) {
        fs.rmSync(f);
        removedFiles++;
      }
    }
  }
  console.log(`  删除媒体文件 ${removedFiles} 个（保留 uploads/guide 官方插画）`);
  console.log('\n清理完成。官方内容（计划模板 / 微运动库 / 敏感词）未受影响。\n');
}

async function main() {
  console.log(`\n=== 布谷演示数据播种 ===\n目标: ${BASE}\n账户: ${Math.min(LIMIT, PERSONAS.length)} 个（用户名 demo_ 前缀）\n口令: ${PASSWORD}\n`);
  const ffmpeg = SKIP_VIDEO ? null : findFfmpeg();
  console.log(ffmpeg ? `ffmpeg: ${ffmpeg}` : SKIP_VIDEO ? 'ffmpeg: 已按参数跳过视频' : 'ffmpeg: 未找到（将跳过视频帖）');
  await loadPhotoIds();
  console.log(`图片库: picsum 可用 id ${photoIds.length} 个（按 id 顺序取用，天然互异 + 内容指纹兜底）`);

  // --- 阶段 1：账户就绪（先登录，不存在再注册）---
  console.log('\n[1/6] 账户就绪');
  const accounts = [];
  for (const p of PERSONAS.slice(0, LIMIT)) {
    let auth = await login(p.user);
    let mode = '登录';
    if (!auth) {
      auth = await register(p.user);
      mode = '注册';
    }
    if (!auth?.token) throw new Error(`账户 ${p.user} 未取得 token，接口返回 shape 可能已变更`);
    accounts.push({ ...p, token: auth.token, id: auth.user.id });
    console.log(`  ${mode} ${p.name} (@${p.user}) → ${auth.user.id.slice(0, 8)}`);
  }

  // --- 阶段 2：头像 + 健康目标（同时作为「演示账户」标记之一）---
  console.log('\n[2/6] 头像与健康目标');
  for (const [idx, a] of accounts.entries()) {
    const cur = await call('GET', '/users/me', { token: a.token });
    if (cur.data?.avatarUrl) {
      console.log(`  @${a.user} 已有头像，跳过`);
      continue;
    }
    const buf = await fetchImage(AVATAR_SRC(a, idx));
    const up = await upload(buf, `${a.user}-avatar.jpg`, 'image/jpeg', a.token);
    await call('PATCH', '/users/me', { token: a.token, body: { avatarUrl: up.url, healthGoals: a.goals } });
    console.log(`  @${a.user} 头像已设置 → ${up.url}`);
  }

  // --- 阶段 3：加入官方计划（验证 plan-templates 接口）---
  console.log('\n[3/6] 加入官方计划');
  const tpls = (await call('GET', '/plan-templates', { token: accounts[0].token })).data ?? [];
  console.log(`  官方计划模板 ${tpls.length} 个: ${tpls.map((t) => t.name ?? t.title).join(' / ')}`);
  for (let i = 0; i < accounts.length; i++) {
    const tpl = tpls[i % tpls.length];
    const r = await call('POST', `/plan-templates/${tpl.id}/join`, { token: accounts[i].token });
    console.log(`  @${accounts[i].user} 加入「${tpl.name ?? tpl.title}」→ ${r.status}`);
  }

  // --- 阶段 4：发帖（含配图 / 计划快照 / 视频）---
  console.log('\n[4/6] 发布帖子');
  const feedNow = (await call('GET', '/posts?page=1&pageSize=100', { token: accounts[0].token })).data;
  /** 已有帖子内容集合（按作者）——用于逐条幂等判断 */
  const existingTexts = new Map();
  for (const p of feedNow?.items ?? []) {
    const set = existingTexts.get(p.author.username) ?? new Set();
    set.add(p.content);
    existingTexts.set(p.author.username, set);
  }
  const alreadyPosted = (user, text) => existingTexts.get(user)?.has(text) ?? false;
  let imgSeq = 0;
  let newPosts = 0;
  for (const a of accounts) {
    // 图文帖
    for (const [idx, post] of a.posts.entries()) {
      if (alreadyPosted(a.user, post.text)) {
        console.log(`  @${a.user} 第 ${idx + 1} 条图文帖已存在，跳过`);
        continue;
      }
      const media = [];
      for (let k = 0; k < post.imgs.length; k++) {
        const buf = await fetchUniquePhoto();
        const up = await upload(buf, `${a.user}-p${idx}-${imgSeq++}.jpg`, 'image/jpeg', a.token);
        media.push(up.url);
      }
      const r = await call('POST', '/posts', { token: a.token, body: { content: post.text, mediaUrls: media, type: 'user_plan' } });
      newPosts++;
      console.log(`  @${a.user} 图文帖 ${r.status}（${media.length} 张图）`);
    }
    // 计划分享帖
    const snap = buildSnapshot(a.plan);
    const planText = `分享一个新做的计划：「${a.plan.name}」，一共 ${snap.reminders.length} 条提醒，需要的可以直接一键加入。`;
    if (alreadyPosted(a.user, planText)) {
      console.log(`  @${a.user} 计划分享帖已存在，跳过`);
    } else {
      const pr = await call('POST', '/posts', { token: a.token, body: { content: planText, type: 'user_plan', planSnapshot: snap } });
      newPosts++;
      console.log(`  @${a.user} 计划分享帖 ${pr.status}（${snap.reminders.length} 条提醒）`);
    }

    // 视频帖（标记了 video 的账户）
    const VIDEO_TEXT = '随手拍了一段今天的打卡记录，习惯真的是一点点养起来的。';
    if (a.video && ffmpeg && !alreadyPosted(a.user, VIDEO_TEXT)) {
      try {
        const frames = [];
        for (let k = 0; k < a.posts[0].imgs.length; k++) {
          frames.push(await fetchUniquePhoto(true));
        }
        while (frames.length < 3) frames.push(frames[0]);
        const files = frames.slice(0, 3).map((b, i) => {
          const f = path.join(TMP, `${a.user}-f${i}.jpg`);
          fs.writeFileSync(f, b);
          return f;
        });
        const out = path.join(TMP, `${a.user}-clip.mp4`);
        const ok = makeVideo(files, out, ffmpeg);
        if (ok) {
          const up = await upload(fs.readFileSync(out), `${a.user}-clip.mp4`, 'video/mp4', a.token);
          const vr = await call('POST', '/posts', { token: a.token, body: { content: VIDEO_TEXT, mediaUrls: [up.url], type: 'user_plan' } });
          newPosts++;
          console.log(`  @${a.user} 视频帖 ${vr.status} → ${up.url}`);
        } else {
          console.log(`  @${a.user} 视频合成失败，跳过`);
        }
      } catch (e) {
        console.log(`  @${a.user} 视频帖失败：${e.message}`);
      }
    }
  }
  console.log(`  本次新增帖子 ${newPosts} 条`);

  // --- 阶段 5：互动（点赞 / 收藏 / 评论 / 关注）---
  console.log('\n[5/6] 交叉互动');
  let likes = 0;
  let favs = 0;
  let cmts = 0;
  let follows = 0;
  for (let i = 0; i < accounts.length; i++) {
    const me = accounts[i];
    // 关注 4 个其他账户
    const following = (await call('GET', `/users/${me.id}/following`, { token: me.token })).data ?? [];
    const followingIds = new Set(following.map((u) => u.id));
    for (let k = 1; k <= 4; k++) {
      const target = accounts[(i + k) % accounts.length];
      if (target.id === me.id || followingIds.has(target.id)) continue;
      const r = await call('POST', `/users/${target.id}/follow`, { token: me.token });
      if (r.data?.following) {
        follows++;
        // 记入已关注集合，避免同一轮里被后一个 k 再次 toggle 掉（账户数少时会发生）
        followingIds.add(target.id);
      }
    }
    // 给别人的帖子点赞/收藏/评论
    // 注意：点赞/收藏/关注都是 toggle 接口，必须用「我自己视角」的动态流先看已点赞/已收藏状态，
    //       否则重跑会把上一轮点过的赞取消掉（故 feed 按账户逐个取，不能用 accounts[0] 的那份）
    const myFeed = (await call('GET', '/posts?page=1&pageSize=100', { token: me.token })).data;
    const others = (myFeed?.items ?? []).filter((p) => p.author.id !== me.id);
    for (let k = 0; k < others.length; k++) {
      const p = others[k];
      const pick = (i * 7 + k * 3) % 4;
      if ((pick === 0 || pick === 1) && !p.myLiked) {
        const r = await call('POST', `/posts/${p.id}/like`, { token: me.token });
        if (r.data?.liked) likes++;
      }
      if (pick === 2 && !p.myFavorited) {
        const r = await call('POST', `/posts/${p.id}/favorite`, { token: me.token });
        if (r.data?.favorited) favs++;
      }
      if (pick === 3 && (p.commentsCount ?? 0) === 0) {
        const text = COMMENTS[(i + k) % COMMENTS.length];
        const r = await call('POST', `/posts/${p.id}/comment`, { token: me.token, body: { content: text } });
        if (r.status === 201 || r.status === 200) cmts++;
      }
    }
  }
  console.log(`  新增点赞 ${likes}、收藏 ${favs}、评论 ${cmts}、关注 ${follows}`);

  // --- 阶段 6：汇总校验 ---
  console.log('\n[6/6] 校验');
  const final = (await call('GET', '/posts?page=1&pageSize=100', { token: accounts[0].token })).data;
  const byType = {};
  for (const p of final?.items ?? []) byType[p.type] = (byType[p.type] ?? 0) + 1;
  const withPlan = (final?.items ?? []).filter((p) => p.planSnapshot).length;
  const withMedia = (final?.items ?? []).filter((p) => (p.mediaUrls ?? []).length > 0).length;
  const withVideo = (final?.items ?? []).filter((p) => (p.mediaUrls ?? []).some((u) => /\.(mp4|webm)$/i.test(u))).length;
  console.log(`  动态流总数: ${final?.total}`);
  console.log(`  类型分布: ${JSON.stringify(byType)}`);
  console.log(`  含计划的帖子: ${withPlan}   含媒体的帖子: ${withMedia}   含视频的帖子: ${withVideo}`);
  // 媒体可访问性抽检
  const sample = (final?.items ?? []).flatMap((p) => p.mediaUrls ?? []).slice(0, 5);
  for (const u of sample) {
    const r = await fetch(BASE.replace(/\/api\/v1$/, '') + u, { method: 'GET' });
    console.log(`  媒体 ${u} → ${r.status} ${r.headers.get('content-type')}`);
  }
  console.log(`\n完成。演示账户口令统一为：${PASSWORD}（用户名前缀 demo_）`);
  console.log(`本次注册/登录接口调用 ${authCalls} 次（限流 5 次/分钟/IP，故较慢时属正常）\n`);
}

(CLEAN ? cleanDemo() : main()).catch((e) => {
  console.error(`\n${CLEAN ? '清理' : '播种'}失败:`, e.message);
  process.exitCode = 1;
});