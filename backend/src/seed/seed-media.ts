/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvc2VlZC9zZWVkLW1lZGlhLnRzfDIwMjYtMDl8Y2YyMzIxNjUyZg== */
import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';

/**
 * 引导插画 v2（2026-09-06 极简化重绘）：
 * - 风格：细线描边 + 局部淡彩，几何化小人（有发型、非满色填充、元素极简）
 * - 配色：每个动作独立色相（珊瑚/青绿/湖蓝/紫藤/姜黄），不与主题强绑定
 * - 组图：每个动作 2 帧（分解动作，方便跟练）；喝水=笑脸杯序列；吃药=胶囊+水杯
 * - 纯图形无文字（避免部署环境字体差异；右上角步骤点用数字，sans-serif 通用字体）
 */

const W = 640;
const H = 480;
const LINE = '#4A4453'; // 统一描边（深灰紫，柔和）
const PAPER = '#FBFAF7'; // 底色（暖白）

/** 小人配色（shirt 主色 + hair 发色），每个动作独立 */
const PALETTES = {
  coral: { shirt: '#F2825C', hair: '#5C4A3D', fill: '#FDE7DC' },
  teal: { shirt: '#3FAE9E', hair: '#3A3140', fill: '#DDF2EE' },
  lake: { shirt: '#5B94C9', hair: '#6B4A2F', fill: '#E3EEF8' },
  plum: { shirt: '#9B7EC8', hair: '#2E2A38', fill: '#EEE8F8' },
  gold: { shirt: '#E5A83C', hair: '#4A3421', fill: '#FBF0D8' },
};
type PaletteKey = keyof typeof PALETTES;

/**
 * 极简线条小人：圆头 + 发型（short/bob/bun/curly）+ 线条四肢（躯干仅淡彩描边）。
 * pose 控制四肢端点；笔画统一 LINE 色。
 */
function figure(
  pose: 'stand' | 'armsUp' | 'armsF' | 'sit' | 'squat' | 'tiltL' | 'tiltR',
  pal: PaletteKey,
  hair: 'short' | 'bob' | 'bun' | 'curly' = 'short',
) {
  const p = PALETTES[pal];
  const S = `stroke="${LINE}" stroke-width="9" stroke-linecap="round" fill="none"`;
  const head = { x: 320, y: 190 };
  const hairArt =
    hair === 'short'
      ? `<path d="M ${head.x - 26} ${head.y - 6} Q ${head.x} ${head.y - 40} ${head.x + 26} ${head.y - 6}" stroke="${p.hair}" stroke-width="14" stroke-linecap="round" fill="none"/>`
      : hair === 'bob'
        ? `<path d="M ${head.x - 28} ${head.y + 8} Q ${head.x - 32} ${head.y - 36} ${head.x} ${head.y - 36} Q ${head.x + 32} ${head.y - 36} ${head.x + 28} ${head.y + 8}" stroke="${p.hair}" stroke-width="13" stroke-linecap="round" fill="none"/>`
        : hair === 'bun'
          ? `<circle cx="${head.x}" cy="${head.y - 40}" r="12" fill="${p.hair}"/><path d="M ${head.x - 24} ${head.y - 10} Q ${head.x} ${head.y - 36} ${head.x + 24} ${head.y - 10}" stroke="${p.hair}" stroke-width="12" stroke-linecap="round" fill="none"/>`
          : `<circle cx="${head.x - 16}" cy="${head.y - 26}" r="9" fill="${p.hair}"/><circle cx="${head.x}" cy="${head.y - 32}" r="10" fill="${p.hair}"/><circle cx="${head.x + 16}" cy="${head.y - 26}" r="9" fill="${p.hair}"/>`;
  const L = { shL: { x: 292, y: 268 }, shR: { x: 348, y: 268 }, hipL: { x: 308, y: 336 }, hipR: { x: 332, y: 336 } };
  const arms: Record<string, [string, string]> = {
    stand: [`M ${L.shL.x} ${L.shL.y} L 280 330`, `M ${L.shR.x} ${L.shR.y} L 360 330`],
    armsF: [`M ${L.shL.x} ${L.shL.y} Q 260 285 236 296`, `M ${L.shR.x} ${L.shR.y} Q 380 285 404 296`],
    armsUp: [`M ${L.shL.x} ${L.shL.y} Q 258 240 250 208`, `M ${L.shR.x} ${L.shR.y} Q 382 240 390 208`],
    tiltL: [`M ${L.shL.x} ${L.shL.y} Q 250 260 232 244`, `M ${L.shR.x} ${L.shR.y} L 366 322`],
    tiltR: [`M ${L.shL.x} ${L.shL.y} L 274 322`, `M ${L.shR.x} ${L.shR.y} Q 390 260 408 244`],
    sit: [`M ${L.shL.x} ${L.shL.y} L 272 320`, `M ${L.shR.x} ${L.shR.y} L 368 320`],
    squat: [`M ${L.shL.x} ${L.shL.y} L 276 322`, `M ${L.shR.x} ${L.shR.y} L 364 322`],
  };
  const [armL, armR] = arms[pose] ?? arms.stand;
  const legs =
    pose === 'sit'
      ? `<path d="M ${L.hipL.x} ${L.hipL.y} L 306 384 L 240 384" ${S}/><path d="M ${L.hipR.x} ${L.hipR.y} L 334 384 L 400 384" ${S}/>`
      : pose === 'squat'
        ? `<path d="M ${L.hipL.x} ${L.hipL.y} L 296 380 L 292 412" ${S}/><path d="M ${L.hipR.x} ${L.hipR.y} L 344 380 L 348 412" ${S}/>`
        : `<path d="M ${L.hipL.x} ${L.hipL.y} L 304 414" ${S}/><path d="M ${L.hipR.x} ${L.hipR.y} L 336 414" ${S}/>`;
  const tilt = pose === 'tiltL' ? ' transform="rotate(-8 320 300)"' : pose === 'tiltR' ? ' transform="rotate(8 320 300)"' : '';
  return `
    <g${tilt}>
      <rect x="292" y="258" width="56" height="86" rx="26" fill="${p.fill}" stroke="${LINE}" stroke-width="7"/>
      <path d="${armL}" ${S}/>
      <path d="${armR}" ${S}/>
      ${legs}
    </g>
    <circle cx="${head.x}" cy="${head.y}" r="34" fill="${p.fill}" stroke="${LINE}" stroke-width="7"/>
    ${hairArt}
    <circle cx="${head.x - 11}" cy="${head.y + 2}" r="3.4" fill="${LINE}"/>
    <circle cx="${head.x + 11}" cy="${head.y + 2}" r="3.4" fill="${LINE}"/>
    <path d="M ${head.x - 7} ${head.y + 13} Q ${head.x} ${head.y + 19} ${head.x + 7} ${head.y + 13}" stroke="${LINE}" stroke-width="4" stroke-linecap="round" fill="none"/>
  `;
}

const bg = () => `<rect width="${W}" height="${H}" rx="36" fill="${PAPER}"/>`;
const ground = () => `<line x1="110" y1="428" x2="530" y2="428" stroke="#D8D3CB" stroke-width="6" stroke-linecap="round"/>`;
const svgWrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`;
const frame = (inner: string) => svgWrap(`${bg()}${ground()}${inner}`);
/** 步骤序号（右上角几何点 + 数字；sans-serif 通用字体） */
const step = (n: number) =>
  `<circle cx="576" cy="64" r="26" fill="#EFECE6"/><text x="576" y="74" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="700" fill="${LINE}">${n}</text>`;

/** 可爱水杯（笑脸 + 水位；极简达标保留） */
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

/** 全部插画：key → SVG（v2 极简组图体系） */
export function guideIllustrations(): Record<string, string> {
  const cupArt = (level: number, accent: string, s: 'sun' | 'moon' = 'sun') => svgWrap(`${bg()}${sky(s)}${ground()}${cup(level, accent)}`);

  return {
    // ===== 喝水（3 关键时点） =====
    'water-1': cupArt(0.25, '#FF8A65', 'sun'),
    'water-5': cupArt(0.6, '#4DB6AC', 'sun'),
    'water-7': cupArt(0.9, '#9575CD', 'moon'),
    'water-generic': cupArt(0.6, '#4FC3F7', 'sun'),

    // ===== 用药（2 帧：胶囊 / 送水吞服） =====
    'medication-1': svgWrap(
      `${bg()}<g transform="rotate(-18 320 300)"><rect x="250" y="270" width="140" height="64" rx="32" fill="#F2825C"/><rect x="250" y="270" width="70" height="64" rx="32" fill="#FFF1F4" stroke="${LINE}" stroke-width="6"/></g><circle cx="470" cy="180" r="24" fill="#FFC85C"/>${ground()}`,
    ),
    'medication-2': svgWrap(
      `${bg()}${ground()}<g transform="rotate(-14 250 300)"><rect x="200" y="280" width="96" height="44" rx="22" fill="#F2825C" stroke="${LINE}" stroke-width="6"/></g>${cup(0.55, '#8FC9E8')}`,
    ),

    // ===== 动作组图（每动作 2 帧；色相/发型各异） =====
    'neck-1': frame(`${step(1)}${figure('tiltR', 'coral', 'short')}`),
    'neck-2': frame(`${step(2)}${figure('tiltL', 'coral', 'short')}`),
    'shoulder-1': frame(`${step(1)}${figure('armsF', 'teal', 'bob')}`),
    'shoulder-2': frame(`${step(2)}${figure('armsUp', 'teal', 'bob')}`),
    'wrist-1': frame(`${step(1)}${figure('armsF', 'lake', 'curly')}<circle cx="212" cy="298" r="18" stroke="${LINE}" stroke-width="6" fill="none"/>`),
    'stretch-1': frame(`${step(1)}${figure('armsUp', 'plum', 'bun')}`),
    'stretch-2': frame(`${step(2)}${figure('tiltL', 'plum', 'bun')}`),
    'kegel-1': frame(`${step(1)}${figure('sit', 'gold', 'bun')}<ellipse cx="320" cy="330" rx="62" ry="26" stroke="#E5A83C" stroke-width="7" fill="none"/>`),
    'kegel-2': frame(`${step(2)}${figure('sit', 'gold', 'bun')}<ellipse cx="320" cy="330" rx="84" ry="38" stroke="#E5A83C" stroke-width="5" fill="none" opacity=".55"/>`),
    'neck-ret-1': frame(`${step(1)}${figure('stand', 'lake', 'short')}<path d="M 372 190 Q 392 210 372 230" stroke="#5B94C9" stroke-width="8" stroke-linecap="round" fill="none" stroke-dasharray="2 12"/>`),
    'neck-ret-2': frame(`${step(2)}${figure('stand', 'lake', 'short')}<path d="M 252 190 Q 232 210 252 230" stroke="#5B94C9" stroke-width="8" stroke-linecap="round" fill="none" stroke-dasharray="2 12"/>`),
    'eye-far': frame(`${step(1)}${figure('stand', 'teal', 'bob')}<path d="M 452 160 L 500 120 L 548 160" stroke="#3FAE9E" stroke-width="10" stroke-linecap="round" fill="none"/>`),
    'eye-close': frame(`${step(2)}${figure('stand', 'teal', 'bob')}<path d="M 306 194 Q 313 202 320 194 Q 327 202 334 194" stroke="${LINE}" stroke-width="5" stroke-linecap="round" fill="none"/>`),
    'squat-1': frame(`${step(1)}${figure('stand', 'coral', 'short')}<rect x="150" y="150" width="22" height="286" rx="11" fill="#D8D3CB"/>`),
    'squat-2': frame(`${step(2)}${figure('squat', 'coral', 'short')}<rect x="150" y="150" width="22" height="286" rx="11" fill="#D8D3CB"/>`),
    'heel-1': frame(`${step(1)}${figure('stand', 'plum', 'curly')}`),
    'heel-2': frame(`${step(2)}${figure('stand', 'plum', 'curly')}<path d="M 320 140 L 320 108 M 306 122 L 320 108 L 334 122" stroke="#9B7EC8" stroke-width="9" stroke-linecap="round" fill="none"/>`),
    'walk-1': frame(`${step(1)}${figure('stand', 'gold', 'short')}<path d="M 396 424 q 20 -8 30 -22" stroke="#D8D3CB" stroke-width="6" stroke-linecap="round" fill="none"/>`),
    'walk-2': frame(`${step(2)}${figure('stand', 'gold', 'short')}<path d="M 244 424 q -20 -8 -30 -22" stroke="#D8D3CB" stroke-width="6" stroke-linecap="round" fill="none"/>`),
    'breathe-1': frame(`${step(1)}${figure('sit', 'lake', 'bob')}<circle cx="320" cy="330" r="40" stroke="#5B94C9" stroke-width="7" fill="none"/>`),
    'breathe-2': frame(`${step(2)}${figure('sit', 'lake', 'bob')}<circle cx="320" cy="330" r="66" stroke="#5B94C9" stroke-width="5" fill="none" opacity=".5"/>`),
    'standup-1': frame(`${step(1)}<rect x="210" y="336" width="110" height="16" rx="8" fill="#D8D3CB"/>${figure('stand', 'coral', 'bob')}`),
    'standup-2': frame(`${step(2)}${figure('stand', 'coral', 'bob')}<path d="M 452 150 L 500 116 L 548 150" stroke="#F2825C" stroke-width="10" stroke-linecap="round" fill="none"/>`),
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
