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
  pose: 'stand' | 'armsUp' | 'armsF' | 'sit' | 'squat' | 'tiltL' | 'tiltR' | 'walk' | 'bendL' | 'shoulderCircle';
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
    // 2026-09-07 v2.2：体侧拉伸——双臂并拢过顶、随身体向左大弯（C 形）
    bendL: [`M ${L.shL.x} ${L.shL.y} Q 240 240 232 206`, `M ${L.shR.x} ${L.shR.y} Q 252 236 244 204`],
    // 2026-09-07 v2.2：肩部环绕——双手指尖搭肩、肘外展（环绕箭头画在肘外侧）
    shoulderCircle: [`M 294 258 L 240 244 L 288 250`, `M 346 258 L 400 244 L 352 250`],
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
  // bendL：仅躯干+手臂+头侧弯（腿保持直立踩地、头随躯干入组），2026-09-07 v2.2
  const tiltAttr = pose === 'tiltL' ? ' transform="rotate(-14 320 300)"' : pose === 'tiltR' ? ' transform="rotate(14 320 300)"' : pose === 'bendL' ? ' transform="rotate(-18 320 336)"' : '';
  const bend = pose === 'bendL';
  return `
    ${bend ? legs : ''}
    <g${tiltAttr}>
      <path d="${armL}" ${S}/>
      <path d="${armR}" ${S}/>
      ${bend ? '' : legs}
      <rect x="292" y="246" width="56" height="92" rx="26" fill="${p.fill}" stroke="${LINE}" stroke-width="7"/>
      ${bend ? headG : ''}
    </g>
    ${bend ? '' : headG}
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

    // ===== 动作组图（姿势与文字对应；2026-09-07 v2.2 重画） =====
    // 颈部左右拉伸：头向左倾 / 向右倾（头部整体侧倾）
    'neck-1': frame(`${step(1)}${figure({ pose: 'stand', pal: 'coral', headTilt: -18 })}`),
    'neck-2': frame(`${step(2)}${figure({ pose: 'stand', pal: 'coral', headTilt: 18 })}`),
    // 肩部环绕 v2.2：双手指尖搭肩、肘外展——环绕箭头绕肘画圆（向后画圈）
    'shoulder-1': frame(
      `${step(1)}${figure({ pose: 'shoulderCircle', pal: 'teal', hair: 'bob' })}${arcArrow('M 206 288 A 46 46 0 1 1 252 196', '#3FAE9E')}`,
    ),
    'shoulder-2': frame(
      `${step(2)}${figure({ pose: 'shoulderCircle', pal: 'teal', hair: 'bob' })}${arcArrow('M 434 196 A 46 46 0 1 1 480 288', '#3FAE9E')}`,
    ),
    // 手腕放松 v2.2：不画人——双手前伸十指交叉 + 向外翻转推箭头（按文字描述绘图）
    'wrist-1': frame(
      `${step(1)}
       <path d="M 138 404 L 262 330" stroke="${LINE}" stroke-width="17" stroke-linecap="round" fill="none"/>
       <path d="M 502 404 L 378 330" stroke="${LINE}" stroke-width="17" stroke-linecap="round" fill="none"/>
       <ellipse cx="288" cy="312" rx="46" ry="38" fill="#FFF" stroke="${LINE}" stroke-width="7"/>
       <ellipse cx="352" cy="312" rx="46" ry="38" fill="#E3EEF8" stroke="${LINE}" stroke-width="7"/>
       <path d="M 270 280 L 254 232 M 292 274 L 283 224" stroke="${LINE}" stroke-width="10" stroke-linecap="round" fill="none"/>
       <path d="M 370 280 L 386 232 M 348 274 L 357 224" stroke="#5B94C9" stroke-width="10" stroke-linecap="round" fill="none"/>
       <path d="M 246 300 Q 226 292 222 272" stroke="${LINE}" stroke-width="10" stroke-linecap="round" fill="none"/>
       <path d="M 394 300 Q 414 292 418 272" stroke="#5B94C9" stroke-width="10" stroke-linecap="round" fill="none"/>
       <path d="M 320 236 L 320 178 M 300 198 L 320 178 L 340 198" stroke="#C77E3C" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
       <path d="M 236 236 Q 210 260 214 296" stroke="#C77E3C" stroke-width="7" stroke-linecap="round" fill="none" opacity=".6"/>
       <path d="M 404 236 Q 430 260 426 296" stroke="#C77E3C" stroke-width="7" stroke-linecap="round" fill="none" opacity=".6"/>`,
    ),
    // 体侧拉伸 v2.2：双臂并拢过顶站立 / 双臂过顶随身体向左大弯（C 形）+ 侧向箭头
    'stretch-1': frame(`${step(1)}${figure({ pose: 'armsUp', pal: 'plum', hair: 'bun' })}`),
    'stretch-2': frame(
      `${step(2)}${figure({ pose: 'bendL', pal: 'plum', hair: 'bun' })}${arcArrow('M 414 250 Q 436 300 414 350', '#9B7EC8')}`,
    ),
    // 提肛 v2.2：不画人——菊花收缩示意（同心环）：收缩=内环实线+向内箭头 / 放松=外环虚线+向外箭头
    'kegel-1': frame(
      `${step(1)}
       <ellipse cx="320" cy="300" rx="46" ry="30" fill="#F6D8C4" stroke="${LINE}" stroke-width="7"/>
       <ellipse cx="320" cy="300" rx="20" ry="13" fill="#E5A83C" opacity=".85"/>
       <path d="M 250 300 L 272 300 M 259 291 L 272 300 L 259 309" stroke="#C77E3C" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
       <path d="M 390 300 L 368 300 M 381 291 L 368 300 L 381 309" stroke="#C77E3C" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
       <text x="320" y="402" text-anchor="middle" font-family="sans-serif" font-size="26" fill="${LINE}">收</text>`,
    ),
    'kegel-2': frame(
      `${step(2)}
       <ellipse cx="320" cy="300" rx="46" ry="30" fill="#F6D8C4" stroke="${LINE}" stroke-width="7"/>
       <ellipse cx="320" cy="300" rx="20" ry="13" fill="none" stroke="#E5A83C" stroke-width="5" stroke-dasharray="7 9"/>
       <path d="M 226 300 L 250 300 M 238 291 L 250 300 L 238 309" stroke="#C77E3C" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="rotate(180 238 300)"/>
       <path d="M 414 300 L 390 300 M 402 291 L 390 300 L 402 309" stroke="#C77E3C" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
       <text x="320" y="402" text-anchor="middle" font-family="sans-serif" font-size="26" fill="${LINE}">松</text>`,
    ),
    // 颈部后缩 v2.2：侧视图——头前伸（龟颈）/ 下巴水平后收成双下巴 + 方向箭头
    'neck-ret-1': frame(
      `${step(1)}
       <path d="M 262 428 L 262 330 Q 262 296 296 292" stroke="${LINE}" stroke-width="9" stroke-linecap="round" fill="none"/>
       <path d="M 296 292 L 340 288" stroke="${LINE}" stroke-width="26" stroke-linecap="round" fill="none"/>
       <circle cx="392" cy="238" r="44" fill="#E3EEF8" stroke="${LINE}" stroke-width="7"/>
       <path d="M 430 250 L 446 256 L 430 264" stroke="${LINE}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
       <circle cx="402" cy="230" r="3.6" fill="${LINE}"/>
       <path d="M 372 276 Q 380 284 392 282" stroke="${LINE}" stroke-width="5" stroke-linecap="round" fill="none"/>
       ${arcArrow('M 470 238 Q 486 300 452 336', '#5B94C9')}`,
    ),
    'neck-ret-2': frame(
      `${step(2)}
       <path d="M 262 428 L 262 330 Q 262 296 296 292" stroke="${LINE}" stroke-width="9" stroke-linecap="round" fill="none"/>
       <path d="M 296 292 L 340 288" stroke="${LINE}" stroke-width="26" stroke-linecap="round" fill="none"/>
       <circle cx="352" cy="238" r="44" fill="#E3EEF8" stroke="${LINE}" stroke-width="7"/>
       <path d="M 390 250 L 406 256 L 390 264" stroke="${LINE}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
       <circle cx="362" cy="230" r="3.6" fill="${LINE}"/>
       <path d="M 330 274 Q 342 288 360 282 Q 368 279 370 272" stroke="${LINE}" stroke-width="5" stroke-linecap="round" fill="none"/>
       ${arcArrow('M 268 220 Q 250 262 282 300', '#5B94C9')}`,
    ),
    // 眼部 v2.2：不画人——眼睛特写远眺（视线箭头→远山）/ 闭眼睫毛特写
    'eye-far': frame(
      `${step(1)}
       <path d="M 170 240 Q 240 172 310 240 Q 240 300 170 240 Z" fill="#FFF" stroke="${LINE}" stroke-width="8" stroke-linejoin="round"/>
       <circle cx="240" cy="238" r="30" fill="#8FC9E8" stroke="${LINE}" stroke-width="6"/>
       <circle cx="240" cy="238" r="12" fill="${LINE}"/>
       <circle cx="249" cy="228" r="6" fill="#FFF"/>
       <path d="M 322 232 L 396 232 M 380 218 L 398 232 L 380 246" stroke="#3FAE9E" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
       <path d="M 452 262 L 500 210 L 548 262 Z" fill="#DDF2EE" stroke="#3FAE9E" stroke-width="7" stroke-linejoin="round"/>
       <path d="M 520 262 L 556 224 L 584 262" fill="none" stroke="#3FAE9E" stroke-width="7" stroke-linejoin="round"/>`,
    ),
    'eye-close': frame(
      `${step(2)}
       <path d="M 170 236 Q 240 292 310 236" stroke="${LINE}" stroke-width="8" stroke-linecap="round" fill="none"/>
       <path d="M 196 262 L 186 282 M 240 272 L 240 294 M 284 262 L 294 282" stroke="${LINE}" stroke-width="7" stroke-linecap="round" fill="none"/>
       <path d="M 372 232 Q 400 214 428 232 Q 456 250 484 232" stroke="#3FAE9E" stroke-width="7" stroke-linecap="round" fill="none"/>
       <path d="M 372 264 Q 400 246 428 264 Q 456 282 484 264" stroke="#3FAE9E" stroke-width="7" stroke-linecap="round" fill="none" opacity=".45"/>`,
    ),
    // 靠墙静蹲：站立（准备）/ 屈膝蹲（靠墙）
    'squat-1': frame(`${step(1)}${figure({ pose: 'stand', pal: 'coral' })}<rect x="150" y="150" width="22" height="286" rx="11" fill="#D8D3CB"/>`),
    'squat-2': frame(`${step(2)}${figure({ pose: 'squat', pal: 'coral' })}<rect x="150" y="150" width="22" height="286" rx="11" fill="#D8D3CB"/>`),
    // 提踵：站立 / 踮脚（脚跟抬起+向上箭头）
    'heel-1': frame(`${step(1)}${figure({ pose: 'stand', pal: 'plum', hair: 'curly' })}`),
    'heel-2': frame(`${step(2)}${figure({ pose: 'stand', pal: 'plum', hair: 'curly', tiptoe: true })}<path d="M 320 140 L 320 106 M 305 121 L 320 106 L 335 121" stroke="#9B7EC8" stroke-width="9" stroke-linecap="round" fill="none"/>`),
    // 深呼吸 v2.2：不画人——呼吸节奏示意：吸气=三层向内聚拢箭头 / 呼气=向外扩散
    'breathe-1': frame(
      `${step(1)}
       <circle cx="320" cy="280" r="34" fill="#DDF2EE" stroke="#3FAE9E" stroke-width="7"/>
       <path d="M 320 190 L 320 226 M 306 212 L 320 226 L 334 212" stroke="#5B94C9" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
       <path d="M 212 280 L 268 280 M 252 264 L 268 280 L 252 296" stroke="#5B94C9" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
       <path d="M 428 280 L 372 280 M 388 264 L 372 280 L 388 296" stroke="#5B94C9" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
       <text x="320" y="402" text-anchor="middle" font-family="sans-serif" font-size="26" fill="${LINE}">吸气 4s</text>`,
    ),
    'breathe-2': frame(
      `${step(2)}
       <circle cx="320" cy="280" r="86" fill="none" stroke="#5B94C9" stroke-width="5" stroke-dasharray="8 12" opacity=".6"/>
       <circle cx="320" cy="280" r="34" fill="#DDF2EE" stroke="#3FAE9E" stroke-width="7"/>
       <path d="M 320 226 L 320 190 M 306 204 L 320 190 L 334 204" stroke="#5B94C9" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
       <path d="M 268 280 L 212 280 M 228 264 L 212 280 L 228 296" stroke="#5B94C9" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
       <path d="M 372 280 L 428 280 M 412 264 L 428 280 L 412 296" stroke="#5B94C9" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
       <text x="320" y="402" text-anchor="middle" font-family="sans-serif" font-size="26" fill="${LINE}">呼气 6s</text>`,
    ),
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
