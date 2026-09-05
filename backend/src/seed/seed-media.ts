import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';

/**
 * 引导插画（#26 内容配套）：启动时用 sharp 把内置 SVG 渲染为 webp 写入 uploads/guide/，
 * 官方计划 / 微运动库 / 喝水计划引用 /uploads/guide/*.webp——部署可复现，无需人工放置素材。
 * 画风：圆润扁平 + 笑脸，与 App 布谷绿（#2E7D6B）一致；纯图形不含文字（避免字体环境差异）。
 */

const W = 640;
const H = 480;
const GREEN = '#2E7D6B';
const GREEN_SOFT = '#DDEDE7';
const SKIN = '#FFD9B8';
const INK = '#3F544E';

/** 可爱小人：头 + 身体 + 可摆姿手臂（角度制） */
function person(pose: 'stand' | 'sit' | 'squat' | 'armsUp' | 'armsForward', opts: { headShift?: number; shirt?: string } = {}) {
  const hx = 320 + (opts.headShift ?? 0);
  const shirt = opts.shirt ?? GREEN;
  const arms =
    pose === 'armsUp'
      ? `<path d="M 275 300 Q 235 250 245 205" stroke="${shirt}" stroke-width="26" stroke-linecap="round" fill="none"/>
         <path d="M 365 300 Q 405 250 395 205" stroke="${shirt}" stroke-width="26" stroke-linecap="round" fill="none"/>`
      : pose === 'armsForward'
        ? `<path d="M 278 305 Q 240 300 215 320" stroke="${shirt}" stroke-width="26" stroke-linecap="round" fill="none"/>
           <path d="M 362 305 Q 400 300 425 320" stroke="${shirt}" stroke-width="26" stroke-linecap="round" fill="none"/>`
        : `<path d="M 278 300 Q 265 340 272 372" stroke="${shirt}" stroke-width="26" stroke-linecap="round" fill="none"/>
           <path d="M 362 300 Q 375 340 368 372" stroke="${shirt}" stroke-width="26" stroke-linecap="round" fill="none"/>`;
  const legs =
    pose === 'sit'
      ? `<path d="M 292 400 L 292 430 L 220 430" stroke="${INK}" stroke-width="26" stroke-linecap="round" fill="none"/>
         <path d="M 348 400 L 348 430 L 420 430" stroke="${INK}" stroke-width="26" stroke-linecap="round" fill="none"/>`
      : pose === 'squat'
        ? `<path d="M 292 398 Q 275 428 292 442" stroke="${INK}" stroke-width="26" stroke-linecap="round" fill="none"/>
           <path d="M 348 398 Q 365 428 348 442" stroke="${INK}" stroke-width="26" stroke-linecap="round" fill="none"/>`
        : `<path d="M 300 398 L 298 446" stroke="${INK}" stroke-width="26" stroke-linecap="round" fill="none"/>
           <path d="M 340 398 L 342 446" stroke="${INK}" stroke-width="26" stroke-linecap="round" fill="none"/>`;
  return `
    ${legs}
    <rect x="272" y="288" width="96" height="120" rx="40" fill="${shirt}"/>
    ${arms}
    <circle cx="${hx}" cy="240" r="52" fill="${SKIN}"/>
    <circle cx="${hx - 8}" cy="248" r="3" fill="${INK}"/>
    <circle cx="${hx + 8}" cy="248" r="3" fill="${INK}"/>
    <path d="M ${hx - 7} 261 Q ${hx} 267 ${hx + 7} 261" stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none"/>
  `;
}

const bg = (fill = '#F3FAF7') => `<rect width="${W}" height="${H}" rx="36" fill="${fill}"/>`;
const floor = () => `<rect x="60" y="430" width="520" height="14" rx="7" fill="#CBE4DB"/>`;

/** 可爱水杯（水位 + 表情 + 侧边点缀） */
function cup(level: number, accent: string) {
  const topY = 180;
  const botY = 360;
  const fillY = botY - (botY - topY) * level;
  return `
    <path d="M 240 ${topY} L 252 ${botY} Q 254 382 278 382 L 362 382 Q 386 382 388 ${botY} L 400 ${topY} Z"
      fill="#FFFFFF" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M ${240 + 14 * (1 - level)} ${fillY} L 252 ${botY} Q 254 382 278 382 L 362 382 Q 386 382 388 ${botY} L ${400 - 14 * (1 - level)} ${fillY} Z" fill="#7EC8E8"/>
    <circle cx="295" cy="290" r="4" fill="${INK}"/>
    <circle cx="345" cy="290" r="4" fill="${INK}"/>
    <path d="M 302 302 Q 320 314 338 302" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <circle cx="415" cy="200" r="12" fill="${accent}"/>
    <circle cx="205" cy="330" r="9" fill="${accent}"/>
  `;
}

/** 时段点缀（太阳 / 云 / 月亮） */
const sky = (kind: 'sun' | 'cloud' | 'moon') =>
  kind === 'sun'
    ? `<circle cx="520" cy="90" r="34" fill="#FFC85C"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="${520 + 46 * Math.cos((a * Math.PI) / 180)}" y1="${90 + 46 * Math.sin((a * Math.PI) / 180)}" x2="${520 + 58 * Math.cos((a * Math.PI) / 180)}" y2="${90 + 58 * Math.sin((a * Math.PI) / 180)}" stroke="#FFC85C" stroke-width="6" stroke-linecap="round"/>`).join('')}`
    : kind === 'moon'
      ? `<path d="M 540 60 a 34 34 0 1 0 20 62 a 26 26 0 1 1 -20 -62" fill="#F5D982"/>`
      : `<g fill="#FFFFFF" stroke="#D8E8E1" stroke-width="4"><circle cx="500" cy="86" r="20"/><circle cx="526" cy="80" r="26"/><circle cx="550" cy="90" r="18"/></g>`;

const svgWrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`;

/** 全部引导插画（key → SVG） */
export function guideIllustrations(): Record<string, string> {
  const cupArt = (level: number, accent: string, skyKind: 'sun' | 'cloud' | 'moon') =>
    svgWrap(`${bg()}${sky(skyKind)}${floor()}${cup(level, accent)}`);

  return {
    // ===== 喝水计划（8 时点，水位递进 + 时段点缀） =====
    'water-1': cupArt(0.25, '#FF8A65', 'sun'),
    'water-2': cupArt(0.4, '#FFB74D', 'sun'),
    'water-3': cupArt(0.5, '#4FC3F7', 'sun'),
    'water-4': cupArt(0.6, '#81C784', 'cloud'),
    'water-5': cupArt(0.7, '#4DB6AC', 'cloud'),
    'water-6': cupArt(0.8, '#9575CD', 'cloud'),
    'water-7': cupArt(0.9, '#F06292', 'cloud'),
    'water-8': cupArt(1, '#7986CB', 'moon'),

    // ===== 办公室健康操 / 微运动库 =====
    'neck-1': svgWrap(`${bg()}${floor()}${person('stand', { headShift: 26 })}<path d="M 380 200 Q 402 240 380 280" stroke="#F06292" stroke-width="8" stroke-linecap="round" fill="none" stroke-dasharray="2 12"/>`),
    'neck-2': svgWrap(
      `${bg()}${floor()}${person('stand', { headShift: -26 })}
       <path d="M 268 214 Q 240 240 268 266" stroke="#81C784" stroke-width="8" stroke-linecap="round" fill="none" stroke-dasharray="2 12"/>`,
    ),
    'shoulder-1': svgWrap(`${bg()}${floor()}${person('armsForward')}<circle cx="200" cy="300" r="16" stroke="#F06292" stroke-width="6" fill="none"/>`),
    'shoulder-2': svgWrap(`${bg()}${floor()}${person('armsUp')}<circle cx="440" cy="220" r="16" stroke="#F06292" stroke-width="6" fill="none"/>`),
    'wrist-1': svgWrap(`${bg()}${floor()}${person('armsForward')}<circle cx="205" cy="322" r="20" stroke="#4FC3F7" stroke-width="7" fill="none"/>`),
    'eye-far': svgWrap(`${bg()}${floor()}${person('stand')}<circle cx="320" cy="240" r="52" fill="none"/><path d="M 470 150 L 520 110 L 570 150" stroke="#81C784" stroke-width="10" stroke-linecap="round" fill="none"/><path d="M 415 240 L 452 240" stroke="#F06292" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 12"/>`),
    'eye-close': svgWrap(`${bg()}${floor()}${person('stand')}<path d="M 306 246 Q 312 254 320 246 Q 328 254 334 246" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/>`),
    'kegel-1': svgWrap(`${bg()}${floor()}${person('sit')}<ellipse cx="320" cy="330" rx="66" ry="30" stroke="#BA68C8" stroke-width="7" fill="none"/>`),
    'squat-1': svgWrap(`${bg()}${floor()}${person('squat')}<rect x="150" y="150" width="26" height="290" rx="10" fill="#B0BEC5"/>`),
    'heel-1': svgWrap(`${bg()}${floor()}${person('stand')}<path d="M 320 150 L 320 120 M 308 134 L 320 120 L 332 134" stroke="#F06292" stroke-width="8" stroke-linecap="round" fill="none"/>`),
    'stretch-1': svgWrap(`${bg()}${floor()}${person('armsUp')}`),
    'breathe-1': svgWrap(`${bg()}${floor()}${person('sit')}<circle cx="320" cy="330" r="44" stroke="#4FC3F7" stroke-width="6" fill="none"/><circle cx="320" cy="330" r="62" stroke="#4FC3F7" stroke-width="4" fill="none" opacity="0.5"/>`),
    'standup-1': svgWrap(`${bg()}${floor()}<rect x="200" y="330" width="120" height="18" rx="9" fill="#B0BEC5"/>${person('stand', { headShift: 40 })}`),
    // ===== 吃药 / 通用 =====
    'medication-1': svgWrap(
      `${bg('#FDF6F0')}<g transform="rotate(-18 320 300)">
        <rect x="250" y="270" width="140" height="64" rx="32" fill="#F06292"/>
        <rect x="250" y="270" width="70" height="64" rx="32" fill="#FFF1F4" stroke="#F06292" stroke-width="5"/>
      </g>
      <circle cx="470" cy="180" r="26" fill="#FFC85C" opacity="0.85"/>
      ${floor()}`,
    ),
    'water-generic': cupArt(0.6, '#4FC3F7', 'sun'),
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
