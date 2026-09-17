/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zY3JpcHRzL3NlZWQtZGVtby5janN8MjAyNi0wOXw3MDNmY2FiNmM3 */
/**
 * 演示数据播种脚本（开发 / 自测专用，不随 APK 分发、不入公开产物）
 *
 * 作用：批量创建 24 个仿真账户（用户名统一 `demo_` 前缀，便于识别与批量清理），
 *      为它们生成头像与帖子配图（公开图库真实照片）、合成短视频（ffmpeg），
 *      发布图文帖 / 计划分享帖 / 视频帖 / 日常打卡帖，并交叉点赞、收藏、评论、关注、加入官方计划；
 *      最后把整批 demo 数据的时间线回填到最近 60 天（见「时间线后处理」一节）。
 *      注意：配图取自公开图库真实照片，人设里的 imgs 文案仅作「拍摄意图备注」，图库不解析语义。
 *
 * 全部操作走**真实 HTTP 接口**（注册/登录/上传/发帖/互动），因此同时起到接口联调验证作用。
 * 唯一例外是最后的「时间线后处理」：帖子/互动的时间只能由服务端写入，故直连本机 SQLite 回填。
 *
 * 用法：
 *   node scripts/seed-demo.cjs                        # 默认 24 个账户，连本机 3000
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
 *        点赞/收藏/关注先查当前状态再切换；评论仅在帖子评论数为 0 时补；
 *        时间线后处理完全由 id 哈希推导，重跑得到同一套时间（不会每次都变）。
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
const LIMIT = Number(arg('accounts', '24'));
const SKIP_VIDEO = argv.includes('--no-video');
const CLEAN = argv.includes('--clean');
const FFMPEG = arg('ffmpeg', '');
const TMP = path.join(os.tmpdir(), 'cuckoo-demo-seed');
fs.mkdirSync(TMP, { recursive: true });

let authCalls = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 仿真人设（用户名 demo_ 前缀 = 标记，测试完可按前缀批量清理）----------
// 共 24 个：前 12 个是首批（都市上班族 / 老人 / 学生等常见画像），后 12 个是第二批，
// 覆盖更多真实人群（退休老人、陪护家属、教师、宝妈、孕妇、健身教练、夜班护士、外卖骑手、
// 大学生、会计、倒班工人、出租车司机），健康主题覆盖喝水、久坐、用药、睡眠、护眼、
// 颈椎、情绪、减脂、孕期、慢病管理等。
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

  // ---- 第二批：更真实的人群画像（退休、陪护、教师、宝妈、孕期、教练、夜班、骑手、学生、会计、倒班、司机）----
  {
    user: 'demo_wangshouyi',
    name: '王守义',
    goals: ['medication', 'water'],
    avatar: 'photorealistic portrait of a 68-year-old Chinese man with short white hair, gentle smile, plain light background, square headshot',
    posts: [
      { text: '退休以后日子慢下来了，记性反倒不如从前。孩子给设了早晚两次吃药提醒，三个月一次没漏过。', imgs: ['a weekly pill organizer and a cup of warm water on a windowsill in morning light, photorealistic'] },
      { text: '每天早上去公园走一圈，回来先喝一杯温水，浑身都活泛了。', imgs: ['an elderly Chinese man walking on a tree-lined park path in the morning, photorealistic', 'a glass of warm water on a simple wooden table, photorealistic'] },
      { text: '血压本子记了厚厚一本，复诊的时候医生翻两页就明白了，省得我费劲解释半天。', imgs: ['a handwritten blood pressure notebook and a home blood pressure monitor on a table, photorealistic'] },
      { text: '一个人住，更要按时吃饭吃药。提醒响的时候，就像有人惦记着我一样。', imgs: ['a simple home-cooked meal for one person on a wooden table, warm light, photorealistic'] },
    ],
    plan: {
      name: '慢病日常管理计划',
      reminders: [
        { category: 'medication', categoryLabel: '用药', title: '早饭后服药', times: ['08:00'], text: '降压药 1 粒，温水送服' },
        { category: 'medication', categoryLabel: '用药', title: '晚饭后服药', times: ['19:00'], text: '降压药 1 粒，温水送服' },
        { category: 'water', categoryLabel: '喝水', title: '午后补水', times: ['15:00'], text: '喝 200ml 温水' },
      ],
    },
  },
  {
    user: 'demo_wuguifang',
    name: '吴桂芳',
    goals: ['medication', 'water'],
    avatar: 'photorealistic portrait of a 58-year-old Chinese woman with short permed hair, kind smile, plain background, square headshot',
    posts: [
      { text: '老伴血糖高，一天四顿药。我给他设了提醒，自己也记一份，省得两个人互相问来问去。', imgs: ['a pill box and a bowl of oatmeal on a breakfast table, photorealistic'] },
      { text: '照顾病人最怕自己先累倒。现在每天中午给自己留二十分钟午睡，谁叫我都不起。', imgs: ['a quiet bedroom with curtains half drawn in the afternoon, photorealistic'] },
      { text: '晚饭后拉着老伴下楼走二十分钟，他走得慢我就陪他慢，反正也不赶时间。', imgs: ['an elderly couple walking slowly on a residential path at dusk, photorealistic'] },
      { text: '上个月体检我血脂也偏高，从今天起跟他一起吃清淡的，两个人的饭反而好做。', imgs: ['steamed vegetables and fish on a home dining table, photorealistic'] },
    ],
    plan: {
      name: '陪护与自我照顾计划',
      reminders: [
        { category: 'medication', categoryLabel: '用药', title: '早餐前服药', times: ['07:30'], text: '老伴的降糖药，餐前半小时' },
        { category: 'water', categoryLabel: '喝水', title: '下午补水', times: ['16:00'], text: '喝一杯温水，顺便歇一会儿' },
        { category: 'sleep', categoryLabel: '睡眠', title: '午休', times: ['13:00'], text: '躺下休息 20 分钟' },
      ],
    },
  },
  {
    user: 'demo_chenjingyi',
    name: '陈静宜',
    goals: ['sedentary', 'sleep'],
    avatar: 'photorealistic portrait of a 42-year-old Chinese woman teacher with shoulder-length hair, gentle expression, plain background, square headshot',
    posts: [
      { text: '连着上三节课，脖子硬得像块木头。现在下课铃一响，先做两分钟颈部放松再收教案。', imgs: ['a classroom with empty desks and a blackboard, soft daylight, photorealistic', 'a middle-aged woman doing a gentle neck stretch, photorealistic'] },
      { text: '批作业批到十一点，眼睛干得睁不开。后来设了护眼提醒，每小时看看窗外，好多了。', imgs: ['a desk lamp lighting a stack of homework notebooks at night, photorealistic'] },
      { text: '班里孩子吵，回家还得管自己的娃。深呼吸三次再开口，这招真的救过我好几次。', imgs: ['a window with a cup of tea on the sill, quiet afternoon light, photorealistic'] },
      { text: '期末那阵子天天熬夜，后来想明白了：成绩是学生的，身体是自己的。现在十一点必须关灯。', imgs: ['a bedroom with the lamp switched off and moonlight through the curtain, photorealistic'] },
    ],
    plan: {
      name: '教师护颈护眼计划',
      reminders: [
        { category: 'sedentary', categoryLabel: '久坐', title: '课间活动', repeat: { type: 'interval', minutes: 45 }, text: '起身走动，转转脖子和肩膀' },
        { category: 'eye', categoryLabel: '护眼', title: '远眺放松', times: ['15:30'], text: '看窗外远处 1 分钟' },
        { category: 'sleep', categoryLabel: '睡眠', title: '准备休息', times: ['23:00'], text: '关灯，不再看手机' },
      ],
    },
  },
  {
    user: 'demo_sunmeng',
    name: '孙梦',
    goals: ['sleep', 'water'],
    avatar: 'photorealistic portrait of a 31-year-old Chinese woman with a bun hairstyle, soft smile, bright plain background, square headshot',
    posts: [
      { text: '娃两岁，一天下来连喝口水的空都没有。把水杯放在尿布台旁边，看见就喝，一天居然能喝够。', imgs: ['a water bottle on a changing table beside baby supplies, bright room, photorealistic'] },
      { text: '断奶以后开始补觉。娃午睡我也跟着躺二十分钟，晚上脾气好了很多，老公都说我变了。', imgs: ['a mother resting on a sofa beside a sleeping toddler, warm light, photorealistic'] },
      { text: '产后腰不好，抱娃之前先蹲下去。这个小习惯让我少疼了不少。', imgs: ['a woman picking up a toddler from a low shelf with proper posture, photorealistic'] },
      { text: '和小区里的宝妈约着一起记录，谁也不许偷偷熬夜，谁违规了就要请奶茶。', imgs: ['a stroller walk in a residential garden in the afternoon, photorealistic'] },
    ],
    plan: {
      name: '宝妈恢复计划',
      reminders: [
        { category: 'sleep', categoryLabel: '睡眠', title: '娃睡了就放下手机', times: ['22:30'], text: '关灯，跟着一起睡' },
        { category: 'water', categoryLabel: '喝水', title: '喂奶后补水', repeat: { type: 'interval', minutes: 120 }, text: '喝一杯温水' },
        { category: 'sedentary', categoryLabel: '久坐', title: '推娃散步', times: ['16:00'], text: '推车出去走 20 分钟' },
      ],
    },
    video: true,
  },
  {
    user: 'demo_suwan',
    name: '苏婉',
    goals: ['water', 'sleep'],
    avatar: 'photorealistic portrait of a 29-year-old Chinese pregnant woman, long soft hair, serene smile, plain bright background, square headshot',
    posts: [
      { text: '孕中期总忘记喝水，怕水肿又怕喝太少。干脆按点提醒，每小时一小杯，心里踏实多了。', imgs: ['a small glass of water and a prenatal vitamin bottle on a table, photorealistic'] },
      { text: '有几天胎动厉害睡不好，医生让我左侧卧。现在睡前提醒自己调整好姿势再躺下。', imgs: ['a bed with extra pillows arranged for side sleeping, soft lamp light, photorealistic'] },
      { text: '每天散步半小时，产检医生说体重控制得不错，比拿到什么奖都开心。', imgs: ['a pregnant woman walking slowly on a garden path, gentle sunlight, photorealistic'] },
      { text: '孕期情绪起伏大，难受的时候去阳台站一会儿吹吹风，回来就好多了。', imgs: ['a balcony with green plants in the evening light, photorealistic'] },
    ],
    plan: {
      name: '孕期呵护计划',
      reminders: [
        { category: 'water', categoryLabel: '喝水', title: '晨起补水', times: ['08:30'], text: '小口喝 150ml 温水' },
        { category: 'water', categoryLabel: '喝水', title: '午后补水', times: ['15:30'], text: '小口喝 150ml 温水' },
        { category: 'sleep', categoryLabel: '睡眠', title: '左侧卧休息', times: ['22:00'], text: '调整姿势，垫好枕头' },
      ],
    },
  },
  {
    user: 'demo_zhouqiang',
    name: '周强',
    goals: ['water', 'exercise'],
    avatar: 'photorealistic portrait of a 29-year-old Chinese man with athletic build and short hair, sporty jacket, bright background, square headshot',
    posts: [
      { text: '带课八年，最常跟学员说的一句话是：别练太狠，记得按时动。提醒比意志力靠谱多了。', imgs: ['a fitness studio with kettlebells and mats, bright daylight, photorealistic'] },
      { text: '减脂期我给自己设了每小时补水提醒，一天两升半，训练状态完全不一样。', imgs: ['a large water bottle and a training log on a gym floor, photorealistic'] },
      { text: '教别人拉伸，自己反而经常忘。现在课间十分钟，我跟着学员一起练。', imgs: ['a coach guiding a group stretch in a bright gym, photorealistic'] },
      { text: '睡眠是训练的一部分。十一点前睡，第二天的力量训练才抬得起来。', imgs: ['a gym bag and running shoes beside a bed at night, photorealistic'] },
    ],
    plan: {
      name: '训练与恢复计划',
      reminders: [
        { category: 'water', categoryLabel: '喝水', title: '训练间隙补水', repeat: { type: 'interval', minutes: 60 }, text: '补 200ml 水' },
        { category: 'exercise', categoryLabel: '运动', title: '训练前热身', times: ['19:00'], text: '动态拉伸 8 分钟' },
        { category: 'sleep', categoryLabel: '睡眠', title: '按时入睡', times: ['23:00'], text: '关掉手机，准备睡觉' },
      ],
    },
    video: true,
  },
  {
    user: 'demo_hejingwen',
    name: '何静文',
    goals: ['sleep', 'work'],
    avatar: 'photorealistic portrait of a 26-year-old Chinese woman nurse with short hair, light blue scrubs, plain background, square headshot',
    posts: [
      { text: '夜班连轴十二小时，回家第一件事是喝水，第二件事是补觉。提醒帮我把顺序固定下来了。', imgs: ['a glass of water and a nurse badge on a kitchen counter in the morning, photorealistic'] },
      { text: '作息乱是最难受的。白天拉上窗帘、戴耳塞、定好闹钟，睡够六小时晚上才有精神。', imgs: ['a dark bedroom with blackout curtains during the day, photorealistic'] },
      { text: '在科室站一天，腰和腿都是肿的。下班回家把腿抬高躺十分钟，第二天好很多。', imgs: ['a woman resting with legs elevated on a sofa after work, photorealistic'] },
      { text: '给自己也设了喝水提醒，护士的手和嗓子都太容易亏待了。', imgs: ['a hospital corridor in the soft morning light, photorealistic'] },
    ],
    plan: {
      name: '夜班作息计划',
      reminders: [
        { category: 'sleep', categoryLabel: '睡眠', title: '下夜班补觉', times: ['09:00'], text: '拉窗帘、戴耳塞，睡够 6 小时' },
        { category: 'water', categoryLabel: '喝水', title: '上班补水', repeat: { type: 'interval', minutes: 120 }, text: '喝几口水，顺便坐下歇两分钟' },
        { category: 'work', categoryLabel: '工作', title: '交班前放松', times: ['19:30'], text: '做三次深呼吸，活动脚踝' },
      ],
    },
  },
  {
    user: 'demo_mafei',
    name: '马飞',
    goals: ['sedentary', 'water'],
    avatar: 'photorealistic portrait of a 34-year-old Chinese man wearing a delivery jacket and helmet off, plain background, square headshot',
    posts: [
      { text: '跑单的时候顾不上喝水，一天下来嗓子哑得说不出话。现在两小时提醒一次，顺便歇口气。', imgs: ['a delivery rider drinking water beside an electric scooter on a city street, photorealistic'] },
      { text: '骑车久了腰受不了。等餐那两分钟我会下车走两步，伸伸腰，比干坐着强。', imgs: ['a delivery rider stretching his back beside a scooter, photorealistic'] },
      { text: '高峰期爬楼多，膝盖开始抗议。买了护膝，也学着少接两单，钱是挣不完的。', imgs: ['a pair of knee sleeves and a delivery thermal bag on the ground, photorealistic'] },
      { text: '中午随便扒两口是常事。现在提醒我按点吃饭，胃不疼了，下午也有劲。', imgs: ['a simple takeout meal on a scooter seat, city street background, photorealistic'] },
    ],
    plan: {
      name: '跑单健康计划',
      reminders: [
        { category: 'water', categoryLabel: '喝水', title: '跑单补水', repeat: { type: 'interval', minutes: 120 }, text: '停下来喝几口水' },
        { category: 'sedentary', categoryLabel: '久坐', title: '下车活动', repeat: { type: 'interval', minutes: 90 }, text: '下车走两步，伸伸腰' },
        { category: 'medication', categoryLabel: '用药', title: '饭后护胃', times: ['13:00'], text: '饭后半小时服药' },
      ],
    },
    video: true,
  },
  {
    user: 'demo_shenyihang',
    name: '沈亦航',
    goals: ['work', 'sedentary'],
    avatar: 'photorealistic portrait of a 20-year-old Chinese man college student with glasses and a hoodie, plain bright background, square headshot',
    posts: [
      { text: '备考六级，一坐就是一下午。提醒我每小时站起来走两步，效率比硬撑高多了。', imgs: ['a university library desk with textbooks and a laptop, daylight, photorealistic'] },
      { text: '图书馆里最怕忘记喝水。现在水杯放右手边，提醒一响就喝一口，一天两壶。', imgs: ['a water bottle on a library desk beside a stack of books, photorealistic'] },
      { text: '眼睛干到要滴眼药水，后来老老实实做 20-20-20，看远处二十秒，真有用。', imgs: ['a window view of a campus lawn from a study room, photorealistic'] },
      { text: '熬夜复习第二天全废，现在十二点前必须回宿舍睡觉，早上的效率高得多。', imgs: ['a dormitory desk at night with a small lamp and notes, photorealistic'] },
    ],
    plan: {
      name: '备考健康计划',
      reminders: [
        { category: 'water', categoryLabel: '喝水', title: '学习间隙补水', repeat: { type: 'interval', minutes: 60 }, text: '喝水并起身活动一下' },
        { category: 'eye', categoryLabel: '护眼', title: '20-20-20', repeat: { type: 'interval', minutes: 60 }, text: '看远处 20 秒' },
        { category: 'sleep', categoryLabel: '睡眠', title: '回宿舍睡觉', times: ['23:30'], text: '收拾书包，别熬了' },
      ],
    },
    video: true,
  },
  {
    user: 'demo_tiantian',
    name: '田甜',
    goals: ['sedentary', 'work'],
    avatar: 'photorealistic portrait of a 38-year-old Chinese woman accountant with neat hair and blazer, plain background, square headshot',
    posts: [
      { text: '月末结账那几天，一坐下就是十个小时。Excel 再急，也得每小时起来接杯水。', imgs: ['an office desk with two monitors showing spreadsheets, photorealistic'] },
      { text: '颈椎片子拍出来是生理曲度变直，医生说别再低头了。我把显示器垫高，也跟着做颈部操。', imgs: ['a monitor raised on a stand with a keyboard in front, photorealistic'] },
      { text: '数字看久了眼睛发花，把屏幕调暗一档，每小时远眺一次，舒服不少。', imgs: ['an office window with blinds and a small plant on the sill, photorealistic'] },
      { text: '坐久了血液循环差，膝盖以下总是凉的。现在下班先去走两圈再回家。', imgs: ['a woman walking along a city sidewalk in the evening, photorealistic'] },
    ],
    plan: {
      name: '办公室颈椎计划',
      reminders: [
        { category: 'sedentary', categoryLabel: '久坐', title: '起身接水', repeat: { type: 'interval', minutes: 45 }, text: '起身接水，做颈肩拉伸' },
        { category: 'eye', categoryLabel: '护眼', title: '远眺放松', times: ['15:30'], text: '看向窗外远处 1 分钟' },
        { category: 'work', categoryLabel: '工作', title: '下班前收尾', times: ['18:00'], text: '整理桌面，把明天的清单写好' },
      ],
    },
  },
  {
    user: 'demo_gaopeng',
    name: '高鹏',
    goals: ['sleep', 'water'],
    avatar: 'photorealistic portrait of a 40-year-old Chinese man factory worker with short hair and stubble, work shirt, plain background, square headshot',
    posts: [
      { text: '倒班三年，最难的是让身体知道什么时候该睡。下夜班戴着耳塞睡，定好起床闹钟。', imgs: ['a bedroom with blackout curtains and earplugs on the nightstand, photorealistic'] },
      { text: '夜班中间那顿以前顿顿泡面，现在改成自己带的饭盒，胃舒服多了。', imgs: ['a lunch box with rice and vegetables on a factory break table, photorealistic'] },
      { text: '白班夜班来回倒，情绪也容易烦。提醒我每两小时出去透透气，抽根烟就算了。', imgs: ['a factory yard at night with lamps and a parked bicycle, photorealistic'] },
      { text: '下夜班回家路上天亮了，看着太阳反而睡不着。慢慢调，总会好的。', imgs: ['sunrise over an industrial area with a road leading home, photorealistic'] },
    ],
    plan: {
      name: '倒班作息计划',
      reminders: [
        { category: 'sleep', categoryLabel: '睡眠', title: '下夜班睡觉', times: ['09:30'], text: '拉窗帘、戴耳塞，睡到下午' },
        { category: 'water', categoryLabel: '喝水', title: '班中补水', repeat: { type: 'interval', minutes: 120 }, text: '喝几口水，出去透透气' },
        { category: 'work', categoryLabel: '工作', title: '夜班加餐', times: ['01:00'], text: '吃饭盒，别吃泡面' },
      ],
    },
  },
  {
    user: 'demo_luming',
    name: '卢明',
    goals: ['sedentary', 'water'],
    avatar: 'photorealistic portrait of a 52-year-old Chinese man taxi driver with short gray-black hair, plain background, square headshot',
    posts: [
      { text: '开一天车，坐得比谁都久。等客的时候下车走两步，腰真的轻松些。', imgs: ['a taxi parked at the roadside with the driver standing beside it, city daytime, photorealistic'] },
      { text: '车里放了个大水壶，提醒一响就喝一口，不用满地找便利店。', imgs: ['a large water bottle in a car cup holder, dashboard visible, photorealistic'] },
      { text: '五十多了，血糖有点高。媳妇给设的提醒，我照做，复查指标真的下来了。', imgs: ['a blood glucose meter and a notebook on a car seat, photorealistic'] },
      { text: '晚上收车回家，先在小区里走上两圈，不然躺下也睡不着。', imgs: ['a residential compound path at night with warm street lamps, photorealistic'] },
    ],
    plan: {
      name: '司机久坐计划',
      reminders: [
        { category: 'sedentary', categoryLabel: '久坐', title: '停车活动', repeat: { type: 'interval', minutes: 90 }, text: '下车走动两分钟，揉揉腰' },
        { category: 'water', categoryLabel: '喝水', title: '行车补水', repeat: { type: 'interval', minutes: 120 }, text: '喝几口温水' },
        { category: 'medication', categoryLabel: '用药', title: '早饭后服药', times: ['08:00'], text: '按医嘱服药' },
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

// ---------- 日常打卡文案池（24 个账户共用）----------
// 每个账户发帖时按「账户序号 × 每账户条数」从池中**按序取用**，保证全局不重复；
// 因此池子长度必须 ≥ 账户数 × CHECKIN_TEXTS_PER_ACCOUNT（24 × 4 = 96，留有余量）。
// 文案写成像真人随手发的一条，长度控制在 20~80 字。
const CHECKIN_TEXTS_PER_ACCOUNT = 4;
const CHECKIN_TEXTS = [
  '今天第一次一整天都没漏掉喝水提醒，收工的时候看着记录那排小勾，莫名有点小骄傲。',
  '早上那杯温水已经成了习惯，现在不用提醒自己也会先去倒一杯再出门。',
  '本来只是随手记一下，回头翻这半个月的记录，才发现自己真的在慢慢变好。',
  '加班到十点，站起来拉伸了两分钟，肩膀松了，人也清醒了不少。',
  '我妈现在也会自己点「完成」了，两个人的记录挨在一起看，还挺有意思的。',
  '今天的小进步：午休没有趴桌子睡，出去走了十分钟，下午居然一点没犯困。',
  '被提醒救了。下午三点困得不行，起来接水走了一圈，硬是撑过去了。',
  '昨天忘记两顿药，今天把提醒往前挪了十分钟，终于没再漏掉。',
  '连续记录第 21 天。打卡这个动作本身好像就有力量，不做什么都行，但一定要记。',
  '女儿给我设的护眼提醒，每小时看一会儿远处，眼睛没那么干涩了。',
  '今天体检报告出来，医生说指标比上次好，我猜跟这三个月规律喝水有关系。',
  '睡前把手机放到客厅充电，躺下十分钟就睡着了，这个改变真的很值。',
  '刚开始觉得提醒很烦，现在反而离不开了，像有个朋友在旁边念叨你。',
  '今天走了八千步，是这几年最多的一次，膝盖居然没疼，挺开心的。',
  '中午吃了自己带的饭，少油少盐，下午没有那种昏昏沉沉的感觉。',
  '和老公一起在用提醒，互相监督，谁忘了喝水就发消息嘲笑对方。',
  '记录这件事最难的是开头，撑过第一周就顺了，我现在完全不觉得麻烦。',
  '每天下午四点那次提醒，帮我挡掉了很多杯奶茶。',
  '今天在工位上做了颈椎操，同事跟着一起做，笑成一片，做完脖子确实松。',
  '从躺下翻来覆去，到现在沾枕头就着，睡眠记录不会骗人。',
  '今天量了血压，比上周低了几个点，赶紧记下来，开心。',
  '娃睡了以后终于有十分钟自己的时间，做了一组拉伸，算是给自己充个电。',
  '晚饭后陪爸妈散步半小时，两个老人都说腿脚轻松了，我也跟着消食。',
  '跑单的时候也提醒自己喝水，以前一天下来嗓子都是哑的。',
  '今天没喝饮料，只喝了水和一杯茶，对我来说算是一小步。',
  '备考期间最难的不是学习，是记得离开椅子动一动，提醒比自制力管用。',
  '夜班回来睡到下午，作息完全乱了，只能靠提醒硬撑着调整回来。',
  '今天把闹钟提前了二十分钟，早上终于有时间好好吃顿早饭。',
  '减脂第三周，体重掉得不算多，但腰围小了两厘米，比数字更有说服力。',
  '孕期总是忘记喝水，现在每小时提醒一次，浮肿比之前好了一些。',
  '今天情绪有点低落，出门走了二十分钟，回来就好多了，走路真的有用。',
  '给奶奶设的吃药提醒，她现在每天都自己打勾，还会打电话跟我汇报。',
  '今天终于做到了每小时起来一次，腰没有以前那么酸，晚上睡觉也踏实。',
  '记录就像记账，不看不觉得，一看才发现自己每天坐得太久了。',
  '今天的小确幸：三餐都按时吃了，晚上也没有点夜宵。',
  '第一次觉得提醒不是束缚，而是有人在替自己操心，挺暖的。',
  '开车等红灯的时候做两个深呼吸，一整天积的火气都小了点。',
  '今天把水杯换成了带刻度的，看见刻度就有动力多喝两口。',
  '失眠那阵子每晚刷手机到两点，现在十一点前就放下了，第二天整个人不一样。',
  '在病房连轴转了十二小时，回家第一件事是喝水，第二件事是补觉。',
  '今天和朋友一起去爬山，全程没喊累，体能确实比半年前好多了。',
  '每天午饭后靠墙站十分钟，腰背舒服了，身形看着也好看一点。',
  '给老公也加了一个久坐提醒，他今天居然真的起来活动了三次。',
  '今天没刷短视频，把时间用来看书和散步，心里踏实多了。',
  '饭后测的血糖很稳定，医生说继续保持，听到这话特别开心。',
  '今天的记录全是勾，看着就舒服，晚上可以安心睡了。',
  '提醒把我从「一坐一下午」里拉了出来，这比任何励志语录都管用。',
  '今天走在路上抬头看了会儿天，眼睛舒服了很多，颈椎也没那么僵。',
  '孩子的作息终于规律了，我跟着一起早睡，白天总算有力气。',
  '今天加班也没忘记吃药，是被提醒救下来的，谢天谢地。',
  '把每天的水量写在便签上，一天撕一张，很有成就感。',
  '颈椎不舒服去做了理疗，医生说要每小时活动，我现在老老实实照做。',
  '今天早上称重，比上周轻了半斤，慢慢来，不急。',
  '晚上不吃夜宵第五天，胃舒服多了，睡觉也不烧心了。',
  '每天固定时间吃药，胃也跟着舒服了，规律这件事真重要。',
  '早上起来先喝一杯水，这个习惯让我的老毛病好了很多。',
  '今天轮休，睡够了八个小时，感觉整个人都充满电了。',
  '给爸爸的手机也装了提醒，他在老家也能按时吃药，我放心些。',
  '午休只睡了二十分钟，下午反而比睡一小时更有精神。',
  '今天被同事夸气色好，大概是最近早睡早起的功劳。',
  '记录了一周才发现，我一天坐下来几乎没怎么站起来过，挺吓人的。',
  '今天完成了三次眼部放松，眼睛那种干涩发胀的感觉减轻了。',
  '体重没怎么掉，但爬楼不喘了，这也算进步吧，慢慢来。',
  '提醒响的时候正好在忙，但还是站起来走了两步，坚持就是这么一点点攒起来的。',
  '今天陪妈妈去医院复查，医生说指标稳定，我们一家人都松了口气。',
  '孕晚期睡不好，靠着提醒按时休息，白天精神还能撑得住。',
  '今天在楼下小店买了瓶水而不是可乐，给自己点个赞。',
  '像记账一样记健康，坚持一段时间就能看出趋势，比凭感觉靠谱。',
  '和室友约定互相监督喝水，谁忘了就请对方喝奶茶，谁都不敢输。',
  '今天忙到晚上十点才吃饭，还好下午提醒我加过餐，不然真要饿晕。',
  '把提醒铃声换成了很轻的音乐，被提醒的时候不再觉得烦了。',
  '今天没有熬夜，十一点就睡了，早上起来心情莫名很好。',
  '给外公买了个分格药盒，配上提醒，他自己也能按时吃了。',
  '今天站着开了个短会，腿都轻快了不少，以后可以多来几次。',
  '长期对着电脑，眼睛干得厉害，现在每小时都看看窗外的树。',
  '今天的小进步：晚饭只吃了七分饱，睡前居然也没觉得饿。',
  '开始记录以后才知道，自己以前一天连五百毫升水都喝不到。',
  '夜班结束回家路上天刚亮，提醒我该睡觉了，那一刻心里还挺暖的。',
  '今天坚持做完了五分钟的颈肩操，虽然时间短，但至少没偷懒。',
  '第一次跑进三公里，虽然速度不快，但全程没有停下来走。',
  '今天带娃去公园跑了一下午，自己也跟着动了，晚上睡得很沉。',
  '提醒帮我记住了每顿药，也帮我记住了对自己好一点这件事。',
  '今天做到了深呼吸三次再回消息，少发了一次脾气。',
  '同事说我最近脾气好多了，我想大概是睡得好的缘故。',
  '今天喝水记录第一次满格，忍不住截图留下来当纪念。',
  '减脂期最难的是晚饭，我提前准备了青菜，忍住了点外卖的冲动。',
  '今天去医院拿药，顺便问了医生该怎么喝水，学到了不少。',
  '每天记录以后，我对身体的各种感觉都敏锐了很多，这是意外收获。',
  '今天提前一站下公交，走着回家，路上的风很舒服。',
  '把手机放在书房充电，卧室终于安静了，人也跟着静下来。',
  '今天中午按时吃饭，没有一边干活一边往嘴里扒拉。',
  '连续一个月没有漏过药，这在以前的我看来根本不可能。',
  '今天实在太累，只做了一分钟拉伸，但也算做了，不苛责自己。',
  '每天两壶水，皮肤确实没那么干了，比抹护肤品都实在。',
  '今天下班没有直接瘫在沙发上，先去楼下走了两圈，精神反而更好了。',
  '跟远方的爸妈视频，看到他们的记录都打了勾，心里踏实。',
  '今天是记录第九十天，回头看看，习惯真的养成了，没有捷径。',
  '今天起床没有赖床，因为提醒告诉我早饭时间到了。',
  '备考一百天，靠着定时提醒喝水休息，居然一路坚持下来了。',
  '今天午休起来做了一组眼保健操，像回到了小学，还挺舒服。',
  '体重下来了，睡眠也好了，感觉这两件事是连在一起的。',
  '今天医生说血压控制得不错，这个功劳我给提醒记上。',
  '加班路上在地铁里闭眼休息了十分钟，到家没那么累。',
  '今天跟朋友分享了这个方法，她说她也要开始试试。',
  '把奶茶换成了温水，前三天难受，现在完全不馋了，省下来的钱还不少。',
  '今天午饭后没有立刻坐下，靠着墙站了十五分钟，胃也没那么胀。',
  '给家里的老人也做了用药提醒，阿姨说比以前方便多了。',
  '今天的记录里全是绿色，心情跟着都好起来了。',
  '夜班白天补觉，拉上窗帘睡够了六个小时，比之前强太多了。',
  '今天脖子没那么僵，估计是这几天坚持做操的缘故。',
  '骑行送单四十公里，中间记得补了两次水，比上次精神多了。',
  '今天情绪不好的时候出去跑了一圈，回来就想通了大半。',
  '孕期每天散步半小时，晚上睡得踏实，白天胃口也好。',
  '老师这行嗓子最累，现在提醒我每小时喝口水，讲话没那么费劲了。',
  '今天陪孩子写作业，提醒自己不要吼，忍住了两次，进步明显。',
  '记录里能看到自己每天的一点点进步，哪怕很小也很值得。',
  '今天下午特别困，起来洗了把脸喝了水，硬是撑到下班。',
  '药盒、提醒、打卡三件事凑在一起，我终于不再漏药了。',
  '今天第一次在十点前完成了所有提醒，可以早点休息了。',
  '把目标从每天两升水降到一升五，反而轻轻松松做到了。',
  '今天和家人一起走了五千步，边走边聊，比在家刷手机舒服多了。',
  '每周复盘一次记录，是我现在最期待的小仪式。',
  '今天没有吃撑，晚上肚子很舒服，睡觉也踏实。',
  '被提醒这个小东西改变了很多，说不上轰轰烈烈，但真的在慢慢变好。',
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

/** 图库可用图片 id（启动时拉一次，排序后按序取用，保证本轮每张都不同）
 *  24 个账户 + 日常打卡帖后配图总量约 200 张，故最多拉 5 页（500 个 id）。 */
const photoIds = [];
let photoCursor = 0;
async function loadPhotoIds() {
  for (let page = 1; page <= 5 && photoIds.length < 500; page++) {
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
    if (photoCursor >= photoIds.length) throw new Error(`图库 id 已用尽（共 ${photoIds.length} 个），请重跑或扩大图片库列表页数`);
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

// ---------- 时间线后处理（直接读写本机 SQLite）----------
// 播种出来的帖子默认都是「刚刚」，广场翻下去全是同一时刻，一眼假。这里在发帖/互动结束后，
// 直连本机数据库把 demo 数据的时间回填到最近 60 天内：
//   帖子：每个账户有自己的「最新帖时间」（账户之间错开），账户内部再按发帖先后往回铺开，
//         所以同一个账户的帖子不会挤在同一天；全局最新的一条距现在约 20 分钟（广场顶部显示
//         「几分钟前」），最老的一条约 60 天前，且不会出现未来时间。
//   互动：点赞/收藏/加入 = 帖子时间 + 10 分钟 ~ 3 天；评论 = 帖子时间 + 2 小时 ~ 7 天
//         （评论和发帖之间拉开明显间隔，满足「跨天」的观感），同样不超过当前时间。
// 所有偏移量都由 id 哈希（确定性的伪随机）推导，因此重复执行得到同一套时间线，便于复现问题。
const DAY_MS = 86400000;
const MIN_MS = 60000;
const HOUR_MS = 3600000;
const TIMELINE_SPAN_DAYS = 60;
const NEWEST_AGE_MS = 20 * MIN_MS; // 最新一条帖子的年龄：20 分钟

/** 确定性哈希（FNV-1a）→ 0~1 的伪随机数：同一个种子每次结果相同 */
function rand01(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** better-sqlite3 的时间列存法："YYYY-MM-DD HH:mm:ss"（UTC 时刻、不带时区标记） */
const toSqlTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

/** SQLite 时间列 → 毫秒时间戳 */
const fromSqlTime = (s) => Date.parse(`${String(s).replace(' ', 'T')}Z`);

/**
 * 为一组帖子规划新的 createdAt（返回 postId → 毫秒时间戳）。
 * 输入 rows 需按 createdAt 升序（= 发帖先后），同一账户内据此判断「第几条」。
 *
 * 三步推导：账户相位（userId 哈希，0~10 天）→ 账户内均匀回退（最老一条退到 60 天前）
 * → 叠加帖子 id 抖动（半个步长以内，不会把同账户两条帖挤到同一天）。
 */
function planPostTimes(rows, now) {
  const byUser = new Map();
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }
  // 相位最小的账户作为「全局最新」，保证广场顶部有一条「几分钟前」
  const minPhase = Math.min(...[...byUser.keys()].map((u) => rand01(`phase:${u}`)));
  const planned = new Map();
  for (const [userId, list] of byUser) {
    const n = list.length;
    const newestAge = NEWEST_AGE_MS + (rand01(`phase:${userId}`) - minPhase) * 10 * DAY_MS;
    // 每个账户往回铺的跨度不固定（43~60 天），避免 24 个账户的最老一条全挤在第 60 天
    const span = (0.72 + 0.28 * rand01(`span:${userId}`)) * TIMELINE_SPAN_DAYS * DAY_MS;
    const step = n > 1 ? (span - newestAge) / (n - 1) : 0;
    list.forEach((r, j) => {
      const back = n - 1 - j; // 越靠后（越晚发）越新
      const jitter = (rand01(`jitter:${r.id}`) - 0.5) * step * 0.5;
      const age = Math.min(Math.max(newestAge + back * step + jitter, NEWEST_AGE_MS), TIMELINE_SPAN_DAYS * DAY_MS);
      planned.set(r.id, now - age);
    });
  }
  return planned;
}

/** [6/7] 时间线后处理：把 demo 帖子与互动的时间回填到最近 60 天，返回回填的帖子数 */
async function retimeTimeline() {
  const dbFile = path.resolve(__dirname, '..', 'data', 'cuckoo.sqlite');
  if (!fs.existsSync(dbFile)) {
    console.log(`  未找到本机数据库 ${dbFile}，跳过（连远端服务时请到服务器所在机器上执行）`);
    return null;
  }
  const Database = require('better-sqlite3');
  const db = new Database(dbFile);
  db.pragma('busy_timeout = 5000');
  const now = Date.now();
  try {
    const userIds = db.prepare("select id from users where username glob 'demo_*'").all().map((u) => u.id);
    if (!userIds.length) {
      console.log('  没有 demo_ 前缀的演示账户，跳过时间线后处理');
      return 0;
    }
    const ph = userIds.map(() => '?').join(',');
    // 按发帖先后排序（重跑时时间已回填，顺序依然稳定 → 结果可复现）
    const posts = db
      .prepare(`select id, userId from posts where userId in (${ph}) order by createdAt asc, id asc`)
      .all(...userIds);
    const times = planPostTimes(posts, now);

    // 刻意留 3 条「已编辑」帖：挑 3 条 5 天以上的老帖，updatedAt 推到 createdAt 之后 1~3 天
    const editable = posts.filter((p) => now - times.get(p.id) > 5 * DAY_MS);
    const editedIds = new Set();
    for (const f of [0.15, 0.5, 0.85]) {
      const p = editable[Math.floor(editable.length * f)];
      if (p) editedIds.add(p.id);
    }

    const otherPostTimes = new Map(
      db.prepare('select id, createdAt from posts').all().map((r) => [r.id, fromSqlTime(r.createdAt)]),
    );
    const interactions = db
      .prepare(`select id, postId, userId, type from interactions where userId in (${ph})`)
      .all(...userIds);

    const updPost = db.prepare('update posts set createdAt = ?, updatedAt = ? where id = ?');
    const updInter = db.prepare('update interactions set createdAt = ? where id = ?');
    let edited = 0;
    let touched = 0;

    const tx = db.transaction(() => {
      for (const p of posts) {
        const created = times.get(p.id);
        let updated = created; // 默认与 createdAt 相等，避免前端全显示「已编辑」
        if (editedIds.has(p.id) && created + DAY_MS < now - 5 * MIN_MS) {
          const delta = (1 + rand01(`edit:${p.id}`) * 2) * DAY_MS; // 1~3 天
          updated = Math.min(created + delta, now - 5 * MIN_MS);
          if (updated > created) edited++;
          else updated = created;
        }
        updPost.run(toSqlTime(created), toSqlTime(updated), p.id);
      }
      for (const it of interactions) {
        // 互动挂在帖子时间之后：点赞/收藏/加入 10 分钟~3 天，评论 2 小时~7 天
        const base = times.get(it.postId) ?? otherPostTimes.get(it.postId);
        if (!base) continue; // 帖子不属于本批 demo（或已被删），保持原样
        const isComment = it.type === 'comment';
        const floor = isComment ? 2 * HOUR_MS : 10 * MIN_MS;
        const ceil = isComment ? 7 * DAY_MS : 3 * DAY_MS;
        const t = Math.min(base + floor + rand01(`inter:${it.id}`) * (ceil - floor), now - 5 * MIN_MS);
        updInter.run(toSqlTime(t), it.id);
        touched++;
      }
    });
    tx();

    const all = [...times.values()];
    console.log(
      `  demo 帖子 ${posts.length} 条已回填时间：${toSqlTime(Math.min(...all))} ~ ${toSqlTime(Math.max(...all))}（UTC）`,
    );
    console.log(`  互动 ${touched} 条已按「帖子时间 + 间隔」回填（其中评论的间隔为 2 小时~7 天）`);
    console.log(`  其中 ${edited} 条帖子的 updatedAt 晚于 createdAt，用于演示「已编辑」角标`);
    return posts.length;
  } finally {
    db.close();
  }
}

async function main() {
  console.log(`\n=== 布谷演示数据播种 ===\n目标: ${BASE}\n账户: ${Math.min(LIMIT, PERSONAS.length)} 个（用户名 demo_ 前缀）\n口令: ${PASSWORD}\n`);
  const ffmpeg = SKIP_VIDEO ? null : findFfmpeg();
  console.log(ffmpeg ? `ffmpeg: ${ffmpeg}` : SKIP_VIDEO ? 'ffmpeg: 已按参数跳过视频' : 'ffmpeg: 未找到（将跳过视频帖）');
  await loadPhotoIds();
  console.log(`图片库: picsum 可用 id ${photoIds.length} 个（最多拉 5 页；按 id 顺序取用，天然互异 + 内容指纹兜底）`);

  // --- 阶段 1：账户就绪（先登录，不存在再注册）---
  console.log('\n[1/7] 账户就绪');
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
  console.log('\n[2/7] 头像与健康目标');
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
  console.log('\n[3/7] 加入官方计划');
  const tpls = (await call('GET', '/plan-templates', { token: accounts[0].token })).data ?? [];
  console.log(`  官方计划模板 ${tpls.length} 个: ${tpls.map((t) => t.name ?? t.title).join(' / ')}`);
  for (let i = 0; i < accounts.length; i++) {
    const tpl = tpls[i % tpls.length];
    const r = await call('POST', `/plan-templates/${tpl.id}/join`, { token: accounts[i].token });
    console.log(`  @${accounts[i].user} 加入「${tpl.name ?? tpl.title}」→ ${r.status}`);
  }

  // --- 阶段 4：发帖（含配图 / 计划快照 / 视频）---
  console.log('\n[4/7] 发布帖子');
  /** 分页拉完动态流：幂等判断必须看到全部历史帖（只读第 1 页会把 100 条之后的帖子重发一遍） */
  const fetchAllPosts = async (token) => {
    const all = [];
    for (let page = 1; page <= 20; page++) {
      const r = (await call('GET', `/posts?page=${page}&pageSize=100`, { token })).data;
      const items = r?.items ?? [];
      all.push(...items);
      if (!items.length || all.length >= (r?.total ?? 0)) break;
    }
    return all;
  };
  const feedNow = await fetchAllPosts(accounts[0].token);
  /** 已有帖子内容集合（按作者）——用于逐条幂等判断 */
  const existingTexts = new Map();
  for (const p of feedNow) {
    const set = existingTexts.get(p.author.username) ?? new Set();
    set.add(p.content);
    existingTexts.set(p.author.username, set);
  }
  const alreadyPosted = (user, text) => existingTexts.get(user)?.has(text) ?? false;
  // 日常打卡帖：文案从共享池里按序取用（账户序号 × 每账户条数），全局不重复
  const poolNeed = accounts.length * CHECKIN_TEXTS_PER_ACCOUNT;
  if (CHECKIN_TEXTS.length < poolNeed) {
    throw new Error(`日常打卡文案池不足：需要 ${poolNeed} 条，现有 ${CHECKIN_TEXTS.length} 条`);
  }
  let imgSeq = 0;
  let newPosts = 0;
  for (const [i, a] of accounts.entries()) {
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

    // 日常打卡帖：每人 4 条，文案按序取自共享池；约一半配 1 张图（控制图片总量与耗时）
    let poolAdded = 0;
    let poolSkipped = 0;
    for (let j = 0; j < CHECKIN_TEXTS_PER_ACCOUNT; j++) {
      const poolIdx = i * CHECKIN_TEXTS_PER_ACCOUNT + j;
      const text = CHECKIN_TEXTS[poolIdx];
      if (alreadyPosted(a.user, text)) {
        poolSkipped++;
        continue;
      }
      const media = [];
      if (poolIdx % 2 === 0) {
        const buf = await fetchUniquePhoto();
        const up = await upload(buf, `${a.user}-d${j}-${imgSeq++}.jpg`, 'image/jpeg', a.token);
        media.push(up.url);
      }
      const dr = await call('POST', '/posts', { token: a.token, body: { content: text, mediaUrls: media, type: 'user_plan' } });
      if (dr.status !== 201 && dr.status !== 200) throw new Error(`日常打卡帖发布失败 ${dr.status} ${JSON.stringify(dr.data)}`);
      newPosts++;
      poolAdded++;
    }
    console.log(`  @${a.user} 日常打卡帖新增 ${poolAdded} 条${poolSkipped ? `（已存在 ${poolSkipped} 条）` : ''}`);

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
  console.log('\n[5/7] 交叉互动');
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

  // --- 阶段 6：时间线后处理（帖子/互动的时间回填到最近 60 天）---
  console.log('\n[6/7] 时间线后处理');
  const demoPostCount = await retimeTimeline();

  // --- 阶段 7：汇总校验 ---
  console.log('\n[7/7] 校验');
  const allPosts = await fetchAllPosts(accounts[0].token);
  const demoPosts = allPosts.filter((p) => String(p.author?.username ?? '').startsWith('demo_'));
  const byType = {};
  for (const p of demoPosts) byType[p.type] = (byType[p.type] ?? 0) + 1;
  const withPlan = demoPosts.filter((p) => p.planSnapshot).length;
  const withMedia = demoPosts.filter((p) => (p.mediaUrls ?? []).length > 0).length;
  const withVideo = demoPosts.filter((p) => (p.mediaUrls ?? []).some((u) => /\.(mp4|webm)$/i.test(u))).length;
  const mediaCount = new Set(demoPosts.flatMap((p) => p.mediaUrls ?? [])).size;
  console.log(`  demo 帖子实际总数: ${demoPostCount ?? '未统计（未连本机数据库）'} 条`);
  console.log(`  动态流总数: ${allPosts.length} 条（其中 demo_ 账户 ${demoPosts.length} 条）`);
  console.log(`  类型分布: ${JSON.stringify(byType)}`);
  console.log(`  含计划的帖子: ${withPlan}   含媒体的帖子: ${withMedia}   含视频的帖子: ${withVideo}   媒体文件 ${mediaCount} 个`);
  // 媒体可访问性抽检
  const sample = demoPosts.flatMap((p) => p.mediaUrls ?? []).slice(0, 5);
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