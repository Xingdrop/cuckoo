/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvc2VlZC9zZWVkLW1lZGlhLnRzfDIwMjYtMDl8Y2YyMzIxNjUyZg== */
import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';

/**
 * 引导插画 v2.1（2026-09-06 第二轮修订）：
 * - 小人：头与躯干相连（颈部衔接）、四肢画在躯干「后面」（从身后伸出，线条不侵入身体）
 * - 姿势与文字严格对应：颈=头部侧倾/前后、蹲=屈膝靠墙、踮脚=跟抬、走=分腿摆臂、闭眼=不画瞳孔
 * - 配色：每动作独立色相；线条风（淡彩+描边），元素极简；组图右上角步骤号
 */

const W = 640;
const H = 480;
const LINE = '#4A4453';
const PAPER = '#FBFAF7';

const PALETTES = {
  coral: { shirt: '#F2825C', hair: '#5C4A3D', fill: '#FDE7DC' },
  teal: { shirt: '#3FAE9E', hair: '#3A3140', fill: '#DDF2EE' },
  lake: { shirt: '#5B94C9', hair: '#6B4A2F', fill: '#E3EEF8' },
  plum: { shirt: '#9B7EC8', hair: '#2E2A38', fill: '#EEE8F8' },
  gold: { shirt: '#E5A83C', hair: '#4A3421', fill: '#FBF0D8' },
};
type PaletteKey = keyof typeof PALETTES;

interface FigureOpts {
  pose: 'stand' | 'armsUp' | 'armsF' | 'sit' | 'squat' | 'tiltL' | 'tiltR' | 'walk';
  pal: PaletteKey;
  hair?: 'short' | 'bob' | 'bun' | 'curly';
  /** 头部水平偏移（颈部前倾/后缩用） */
  headShift?: number;
  /** 头部侧倾角度（颈部左右拉伸用，度） */
  headTilt?: number;
  /** 闭眼（眼部放松第 2 帧：不画瞳孔，画弧线） */
  closedEyes?: boolean;
  /** 踮脚（提踵第 2 帧） */
  tiptoe?: boolean;
}

function figure(o: FigureOpts) {
  const { pose, pal, hair = 'short', headShift = 0, headTilt = 0, closedEyes = false, tiptoe = false } = o;
  const p = PALETTES[pal];
  const S = `stroke="${LINE}" stroke-width="9" stroke-linecap="round" fill="none"`;
  const hx = 320 + headShift;
  const hy = 214; // 头心：头底(y+34=248) 与躯干顶(246) 相接
  // 发型
  const hairArt =
    hair === 'short'
      ? `<path d="M ${hx - 26} ${hy - 6} Q ${hx} ${hy - 40} ${hx + 26} ${hy - 6}" stroke="${p.hair}" stroke-width="14" stroke-linecap="round" fill="none"/>`
      : hair === 'bob'
        ? `<path d="M ${hx - 28} ${hy + 8} Q ${hx - 32} ${hy - 36} ${hx} ${hy - 36} Q ${hx + 32} ${hy - 36} ${hx + 28} ${hy + 8}" stroke="${p.hair}" stroke-width="13" stroke-linecap="round" fill="none"/>`
        : hair === 'bun'
          ? `<circle cx="${hx}" cy="${hy - 40}" r="12" fill="${p.hair}"/><path d="M ${hx - 24} ${hy - 10} Q ${hx} ${hy - 36} ${hx + 24} ${hy - 10}" stroke="${p.hair}" stroke-width="12" stroke-linecap="round" fill="none"/>`
          : `<circle cx="${hx - 16}" cy="${hy - 26}" r="9" fill="${p.hair}"/><circle cx="${hx}" cy="${hy - 32}" r="10" fill="${p.hair}"/><circle cx="${hx + 16}" cy="${hy - 26}" r="9" fill="${p.hair}"/>`;
  // 眼（闭眼=两条下弧）
  const eyes = closedEyes
    ? `<path d="M ${hx - 15} ${hy + 3} Q ${hx - 9} ${hy + 10} ${hx - 3} ${hy + 3}" stroke="${LINE}" stroke-width="4.5" stroke-linecap="round" fill="none"/>
       <path d="M ${hx + 3} ${hy + 3} Q ${hx + 9} ${hy + 10} ${hx + 15} ${hy + 3}" stroke="${LINE}" stroke-width="4.5" stroke-linecap="round" fill="none"/>`
    : `<circle cx="${hx - 11}" cy="${hy + 2}" r="3.4" fill="${LINE}"/><circle cx="${hx + 11}" cy="${hy + 2}" r="3.4" fill="${LINE}"/>`;
  // 头（可侧倾/平移）
  const headG =
    headTilt !== 0
      ? `<g transform="rotate(${headTilt} ${hx} ${hy + 30})"><circle cx="${hx}" cy="${hy}" r="34" fill="${p.fill}" stroke="${LINE}" stroke-width="7"/>${hairArt}${eyes}<path d="M ${hx - 7} ${hy + 14} Q ${hx} ${hy + 20} ${hx + 7} ${hy + 14}" stroke="${LINE}" stroke-width="4" stroke-linecap="round" fill="none"/></g>`
      : `<circle cx="${hx}" cy="${hy}" r="34" fill="${p.fill}" stroke="${LINE}" stroke-width="7"/>${hairArt}${eyes}<path d="M ${hx - 7} ${hy + 14} Q ${hx} ${hy + 20} ${hx + 7} ${hy + 14}" stroke="${LINE}" stroke-width="4" stroke-linecap="round" fill="none"/>`;

  // 四肢（画在躯干后面；端点从躯干边缘伸出）
  const L = { shL: { x: 294, y: 258 }, shR: { x: 346, y: 258 }, hipL: { x: 306, y: 330 }, hipR: { x: 334, y: 330 } };
  const arms: Record<string, [string, string]> = {
    stand: [`M ${L.shL.x} ${L.shL.y} L 282 326`, `M ${L.shR.x} ${L.shR.y} L 358 326`],
    armsF: [`M ${L.shL.x} ${L.shL.y} Q 264 280 238 290`, `M ${L.shR.x} ${L.shR.y} Q 376 280 402 290`],
    armsUp: [`M ${L.shL.x} ${L.shL.y} Q 262 232 254 202`, `M ${L.shR.x} ${L.shR.y} Q 378 232 386 202`],
    tiltL: [`M ${L.shL.x} ${L.shL.y} Q 252 250 234 236`, `M ${L.shR.x} ${L.shR.y} Q 380 276 392 262`],
    tiltR: [`M ${L.shL.x} ${L.shL.y} Q 260 276 248 262`, `M ${L.shR.x} ${L.shR.y} Q 388 250 406 236`],
    sit: [`M ${L.shL.x} ${L.shL.y} L 274 314`, `M ${L.shR.x} ${L.shR.y} L 366 314`],
    squat: [`M ${L.shL.x} ${L.shL.y} L 276 316`, `M ${L.shR.x} ${L.shR.y} L 364 316`],
    walk: [`M ${L.shL.x} ${L.shL.y} L 276 320`, `M ${L.shR.x} ${L.shR.y} L 366 316`],
  };
  const [armL, armR] = arms[pose] ?? arms.stand;
  const feetY = tiptoe ? 402 : 414;
  const legs =
    pose === 'sit'
      ? `<path d="M ${L.hipL.x} ${L.hipL.y} L 306 380 L 242 380" ${S}/><path d="M ${L.hipR.x} ${L.hipR.y} L 334 380 L 398 380" ${S}/>`
      : pose === 'squat'
        ? `<path d="M ${L.hipL.x} ${L.hipL.y} L 288 376 L 284 ${feetY - 12}" ${S}/><path d="M ${L.hipR.x} ${L.hipR.y} L 352 376 L 356 ${feetY - 12}" ${S}/>`
        : pose === 'walk'
          ? `<path d="M ${L.hipL.x} ${L.hipL.y} L 282 ${feetY - 4}" ${S}/><path d="M ${L.hipR.x} ${L.hipR.y} L 356 384 L 372 ${feetY - 14}" ${S}/>`
          : `<path d="M ${L.hipL.x} ${L.hipL.y} L 304 ${feetY}" ${S}/><path d="M ${L.hipR.x} ${L.hipR.y} L 336 ${feetY}" ${S}/>`;
  // 躯干（淡彩+描边）盖在四肢之上：四肢从「身后」伸出
  const tiltAttr = pose === 'tiltL' ? ' transform="rotate(-14 320 300)"' : pose === 'tiltR' ? ' transform="rotate(14 320 300)"' : '';
  return `
    <g${tiltAttr}>
      <path d="${armL}" ${S}/>
      <path d="${armR}" ${S}/>
      ${legs}
      <rect x="292" y="246" width="56" height="92" rx="26" fill="${p.fill}" stroke="${LINE}" stroke-width="7"/>
    </g>
    ${headG}
  `;
}

const bg = () => `<rect width="${W}" height="${H}" rx="36" fill="${PAPER}"/>`;
const ground = () => `<line x1="110" y1="428" x2="530" y2="428" stroke="#D8D3CB" stroke-width="6" stroke-linecap="round"/>`;
const svgWrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`;
const frame = (inner: string) => svgWrap(`${bg()}${ground()}${inner}`);
const step = (n: number) =>
  `<circle cx="576" cy="64" r="26" fill="#EFECE6"/><text x="576" y="74" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="700" fill="${LINE}">${n}</text>`;
const arcArrow = (d: string, color: string) => `<path d="${d}" stroke="${color}" stroke-width="8" stroke-linecap="round" fill="none" stroke-dasharray="3 13"/>`;

function cup(level: number, accent: string) {
  const topY = 180;
  const botY = 360;
  const fillY = botY - (botY - topY) * level;
  return `
    <path d="M 240 ${topY} L 252 ${botY} Q 254 382 278 382 L 362 382 Q 386 382 388 ${botY} L 400 ${topY} Z"
      fill="#FFFFFF" stroke="${LINE}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M ${240 + 14 * (1 - level)} ${fillY} L 252 ${botY} Q 254 382 278 382 L 362 382 Q 386 382 388 ${botY} L ${400 - 14 * (1 - level)} ${fillY} Z" fill="#8FC9E8"/>
    <circle cx="295" cy="290" r="4" fill="${LINE}"/>
    <circle cx="345" cy="290" r="4" fill="${LINE}"/>
    <path d="M 302 302 Q 320 314 338 302" stroke="${LINE}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <circle cx="415" cy="200" r="12" fill="${accent}"/>
    <circle cx="205" cy="330" r="9" fill="${accent}"/>
  `;
}
const sky = (kind: 'sun' | 'moon') =>
  kind === 'sun' ? `<circle cx="520" cy="90" r="30" fill="#FFC85C"/>` : `<path d="M 540 60 a 34 34 0 1 0 20 62 a 26 26 0 1 1 -20 -62" fill="#F5D982"/>`;

export function guideIllustrations(): Record<string, string> {
  const cupArt = (level: number, accent: string, s: 'sun' | 'moon' = 'sun') => svgWrap(`${bg()}${sky(s)}${ground()}${cup(level, accent)}`);

  return {
    // ===== 喝水 =====
    'water-1': cupArt(0.25, '#FF8A65', 'sun'),
    'water-5': cupArt(0.6, '#4DB6AC', 'sun'),
    'water-7': cupArt(0.9, '#9575CD', 'moon'),
    'water-generic': cupArt(0.6, '#4FC3F7', 'sun'),

    // ===== 用药（2 帧） =====
    'medication-1': svgWrap(
      `${bg()}<g transform="rotate(-18 320 300)"><rect x="250" y="270" width="140" height="64" rx="32" fill="#F2825C"/><rect x="250" y="270" width="70" height="64" rx="32" fill="#FFF1F4" stroke="${LINE}" stroke-width="6"/></g><circle cx="470" cy="180" r="24" fill="#FFC85C"/>${ground()}`,
    ),
    'medication-2': svgWrap(
      `${bg()}${ground()}<g transform="rotate(-14 250 300)"><rect x="200" y="280" width="96" height="44" rx="22" fill="#F2825C" stroke="${LINE}" stroke-width="6"/></g>${cup(0.55, '#8FC9E8')}`,
    ),

    // ===== 动作组图（姿势与文字对应） =====
    // 颈部左右拉伸：头向左倾 / 向右倾（头部整体侧倾）
    'neck-1': frame(`${step(1)}${figure({ pose: 'stand', pal: 'coral', headTilt: -18 })}`),
    'neck-2': frame(`${step(2)}${figure({ pose: 'stand', pal: 'coral', headTilt: 18 })}`),
    // 肩部环绕：双臂前平举（向后画圈起点）/ 双臂上举（画圈至顶）+ 环绕箭头
    'shoulder-1': frame(`${step(1)}${figure({ pose: 'armsF', pal: 'teal', hair: 'bob' })}${arcArrow('M 220 250 Q 320 196 420 250', '#3FAE9E')}`),
    'shoulder-2': frame(`${step(2)}${figure({ pose: 'armsUp', pal: 'teal', hair: 'bob' })}${arcArrow('M 236 226 Q 320 150 404 226', '#3FAE9E')}`),
    // 手腕放松：双臂前伸 + 手部圆圈
    'wrist-1': frame(`${step(1)}${figure({ pose: 'armsF', pal: 'lake', hair: 'curly' })}<circle cx="222" cy="292" r="17" stroke="${LINE}" stroke-width="6" fill="none"/>`),
    // 体侧拉伸：双臂上举 / 上举+身体向左大弯（15°）+ 左臂过顶
    'stretch-1': frame(`${step(1)}${figure({ pose: 'armsUp', pal: 'plum', hair: 'bun' })}`),
    'stretch-2': frame(`${step(2)}${figure({ pose: 'tiltL', pal: 'plum', hair: 'bun' })}`),
    // 提肛：收缩（环小且实）/ 放松（环大且虚）
    'kegel-1': frame(`${step(1)}${figure({ pose: 'sit', pal: 'gold', hair: 'bun' })}<ellipse cx="320" cy="330" rx="58" ry="24" stroke="#E5A83C" stroke-width="8" fill="none"/>`),
    'kegel-2': frame(`${step(2)}${figure({ pose: 'sit', pal: 'gold', hair: 'bun' })}<ellipse cx="320" cy="330" rx="86" ry="38" stroke="#E5A83C" stroke-width="5" fill="none" opacity=".5"/>`),
    // 颈部后缩：头前倾（前移）/ 头后收（后移成双下巴）+ 方向箭头
    'neck-ret-1': frame(`${step(1)}${figure({ pose: 'stand', pal: 'lake', headShift: 22 })}${arcArrow('M 388 196 Q 404 214 388 232', '#5B94C9')}`),
    'neck-ret-2': frame(`${step(2)}${figure({ pose: 'stand', pal: 'lake', headShift: -20 })}${arcArrow('M 252 196 Q 236 214 252 232', '#5B94C9')}`),
    // 眼部：看远（山）/ 闭眼（无瞳孔+闭眼弧）
    'eye-far': frame(`${step(1)}${figure({ pose: 'stand', pal: 'teal', hair: 'bob' })}<path d="M 452 160 L 500 120 L 548 160" stroke="#3FAE9E" stroke-width="10" stroke-linecap="round" fill="none"/>`),
    'eye-close': frame(`${step(2)}${figure({ pose: 'stand', pal: 'teal', hair: 'bob', closedEyes: true })}`),
    // 靠墙静蹲：站立（准备）/ 屈膝蹲（靠墙）
    'squat-1': frame(`${step(1)}${figure({ pose: 'stand', pal: 'coral' })}<rect x="150" y="150" width="22" height="286" rx="11" fill="#D8D3CB"/>`),
    'squat-2': frame(`${step(2)}${figure({ pose: 'squat', pal: 'coral' })}<rect x="150" y="150" width="22" height="286" rx="11" fill="#D8D3CB"/>`),
    // 提踵：站立 / 踮脚（脚跟抬起+向上箭头）
    'heel-1': frame(`${step(1)}${figure({ pose: 'stand', pal: 'plum', hair: 'curly' })}`),
    'heel-2': frame(`${step(2)}${figure({ pose: 'stand', pal: 'plum', hair: 'curly', tiptoe: true })}<path d="M 320 140 L 320 106 M 305 121 L 320 106 L 335 121" stroke="#9B7EC8" stroke-width="9" stroke-linecap="round" fill="none"/>`),
    // 起身走动：迈步走（前后分腿）/ 抬臂远眺
    'walk-1': frame(`${step(1)}${figure({ pose: 'walk', pal: 'gold' })}`),
    'walk-2': frame(`${step(2)}${figure({ pose: 'armsUp', pal: 'gold' })}<path d="M 452 160 L 500 122 L 548 160" stroke="#E5A83C" stroke-width="10" stroke-linecap="round" fill="none"/>`),
    // 深呼吸：吸气（小圆）/ 呼气（大圆）
    'breathe-1': frame(`${step(1)}${figure({ pose: 'sit', pal: 'lake', hair: 'bob' })}<circle cx="320" cy="330" r="38" stroke="#5B94C9" stroke-width="7" fill="none"/>`),
    'breathe-2': frame(`${step(2)}${figure({ pose: 'sit', pal: 'lake', hair: 'bob' })}<circle cx="320" cy="330" r="64" stroke="#5B94C9" stroke-width="5" fill="none" opacity=".5"/>`),
    // 起身活动：从座位站起 / 站立远眺
    'standup-1': frame(`${step(1)}<rect x="212" y="338" width="108" height="16" rx="8" fill="#D8D3CB"/>${figure({ pose: 'stand', pal: 'coral', hair: 'bob' })}`),
    'standup-2': frame(`${step(2)}${figure({ pose: 'armsUp', pal: 'coral', hair: 'bob' })}<path d="M 452 150 L 500 116 L 548 150" stroke="#F2825C" stroke-width="10" stroke-linecap="round" fill="none"/>`),
  };
}

/** 渲染全部插画到 <uploadDir>/guide/（已存在则跳过），返回 name → /uploads/guide/name.webp */
export async function ensureGuideMedia(uploadDir: string): Promise<Record<string, string>> {
  const outDir = path.join(process.cwd(), uploadDir, 'guide');
  fs.mkdirSync(outDir, { recursive: true });
  const urls: Record<string, string> = {};
  for (const [name, svg] of Object.entries(guideIllustrations())) {
    const file = path.join(outDir, `${name}.webp`);
    if (!fs.existsSync(file)) {
      await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(file);
    }
    urls[name] = `/uploads/guide/${name}.webp`;
  }
  return urls;
}
