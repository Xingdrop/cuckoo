/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvc2VlZC9zZWVkLW1lZGlhLnRzfDIwMjYtMDl8Y2YyMzIxNjUyZg== */
import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';

/**
 * 引导插画 v3.0（2026-09-07 全面重绘，用户定稿方向）：
 * - 人物动作升级为扁平插画风：填充衣色躯干、长袖手臂、发型、鞋子、正常比例（告别火柴人）
 * - 不适合画人的动作改用「特写/示意」：手腕=双手特写、提肛=花朵收缩、眼部=眼睛特写、深呼吸=肺部节奏图
 * - 静蹲/走动/起身改侧视图（更符合运动解剖直觉）；颈部后缩=头部侧视特写
 * - 每动作 2-3 帧（深呼吸按 4-4-6 节奏 3 帧）；配色每动作独立；右上角步骤号
 */

const W = 640;
const H = 480;
const LINE = '#4A4453';
const PAPER = '#FBFAF7';
const SKIN = '#F5C9A4';
const SKIN2 = '#EDB98E';
const SHOE = '#3E3A46';

/** 人物衣服配色（shirt/pants/hair） */
const PAL = {
  coral: { shirt: '#F2825C', pants: '#5C5470', hair: '#5C4A3D' },
  teal: { shirt: '#3FAE9E', pants: '#4A4453', hair: '#3A3140' },
  lake: { shirt: '#5B94C9', pants: '#55506A', hair: '#6B4A2F' },
  plum: { shirt: '#9B7EC8', pants: '#57506E', hair: '#4A3421' },
  gold: { shirt: '#E5A83C', pants: '#5C5470', hair: '#2E2A38' },
};
type PalKey = keyof typeof PAL;

const bg = () => `<rect width="${W}" height="${H}" rx="36" fill="${PAPER}"/>`;
const ground = () => `<line x1="110" y1="428" x2="530" y2="428" stroke="#D8D3CB" stroke-width="6" stroke-linecap="round"/>`;
const svgWrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`;
const frame = (inner: string, withGround = true) => svgWrap(`${bg()}${withGround ? ground() : ''}${inner}`);
const step = (n: number) =>
  `<circle cx="576" cy="64" r="26" fill="#EFECE6"/><text x="576" y="74" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="700" fill="${LINE}">${n}</text>`;
const cap = (d: string, color: string, w = 8) => `<path d="${d}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
const dash = (d: string, color: string, w = 7) => `<path d="${d}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" fill="none" stroke-dasharray="2 14"/>`;
const label = (text: string) => `<text x="320" y="452" text-anchor="middle" font-family="sans-serif" font-size="25" fill="${LINE}">${text}</text>`;

/** 直线箭头（线段 + 实心三角头，头在终点） */
function arrowLine(x1: number, y1: number, x2: number, y2: number, color: string, w = 8): string {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const s = 15;
  const hx = x2 - Math.cos(a) * (s * 0.9);
  const hy = y2 - Math.sin(a) * (s * 0.9);
  const p1 = [hx + Math.cos(a + Math.PI / 2) * (s / 2), hy + Math.sin(a + Math.PI / 2) * (s / 2)];
  const p2 = [hx + Math.cos(a - Math.PI / 2) * (s / 2), hy + Math.sin(a - Math.PI / 2) * (s / 2)];
  return (
    cap(`M ${x1} ${y1} L ${x2} ${y2}`, color, w) +
    `<path d="M ${x2} ${y2} L ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} Z" fill="${color}"/>`
  );
}

/* ================= 人物（正面扁平风） ================= */

type ArmPose = 'down' | 'up' | 'clasp' | 'shoulder';

/**
 * 正面人物 v3.0：头(r32)+发+五官、长袖手臂(衣色)+肤色手、衣色躯干、短裤、裤色双腿、鞋子。
 * bend≠0 时仅上半身（躯干+手臂+头）绕髋部旋转（体侧弯），腿保持踩地。
 */
function personFront(o: {
  cx?: number;
  pal: PalKey;
  arm: ArmPose;
  tilt?: number;
  bend?: number;
  closedEyes?: boolean;
  hair?: 'short' | 'bob' | 'bun' | 'curly';
}): string {
  const cx = o.cx ?? 300;
  const p = PAL[o.pal];
  const tilt = o.tilt ?? 0;
  const bend = o.bend ?? 0;
  const hair = o.hair ?? 'short';

  // 下半身（不随弯腰旋转）
  const legs =
    `<rect x="${cx - 30}" y="256" width="60" height="32" rx="13" fill="${p.pants}"/>` +
    cap(`M ${cx - 20} 284 L ${cx - 24} 344 L ${cx - 24} 402`, p.pants, 17) +
    cap(`M ${cx + 20} 284 L ${cx + 24} 344 L ${cx + 24} 402`, p.pants, 17) +
    `<ellipse cx="${cx - 25}" cy="412" rx="19" ry="10" fill="${SHOE}"/>` +
    `<ellipse cx="${cx + 25}" cy="412" rx="19" ry="10" fill="${SHOE}"/>`;

  // 手臂（衣色长袖 + 肤色手）
  const armPaths: Record<ArmPose, [string, string, string, string]> = {
    down: [`M ${cx - 38} 186 L ${cx - 47} 234 L ${cx - 49} 272`, `${cx - 49} 272`, `M ${cx + 38} 186 L ${cx + 47} 234 L ${cx + 49} 272`, `${cx + 49} 272`],
    up: [`M ${cx - 38} 186 L ${cx - 58} 134 L ${cx - 34} 78`, `${cx - 34} 78`, `M ${cx + 38} 186 L ${cx + 58} 134 L ${cx + 34} 78`, `${cx + 34} 78`],
    clasp: [`M ${cx - 38} 186 L ${cx - 46} 132 L ${cx - 7} 96`, `${cx - 7} 96`, `M ${cx + 38} 186 L ${cx + 46} 132 L ${cx + 7} 96`, `${cx + 7} 96`],
    shoulder: [`M ${cx - 38} 186 L ${cx - 66} 208 L ${cx - 30} 180`, `${cx - 30} 180`, `M ${cx + 38} 186 L ${cx + 66} 208 L ${cx + 30} 180`, `${cx + 30} 180`],
  };
  const [aL, hL, aR, hR] = armPaths[o.arm];
  const arms =
    cap(aL, p.shirt, 15) +
    cap(aR, p.shirt, 15) +
    `<circle cx="${hL}" cy="${hL.split(' ')[1]}" r="9.5" fill="${SKIN}" stroke="${LINE}" stroke-width="4"/>`.replace(`${hL}`, hL.split(' ')[0]) +
    `<circle cx="${hR.split(' ')[0]}" cy="${hR.split(' ')[1]}" r="9.5" fill="${SKIN}" stroke="${LINE}" stroke-width="4"/>`;

  // 头（可侧倾）
  const hx = cx;
  const hy = 124;
  const hairArt =
    hair === 'short'
      ? `<path d="M ${hx - 33} ${hy - 2} A 33 33 0 0 1 ${hx + 33} ${hy - 2} L ${hx + 26} ${hy - 12} Q ${hx + 12} ${hy - 22} ${hx - 14} ${hy - 16} Z" fill="${p.hair}"/>`
      : hair === 'bob'
        ? `<path d="M ${hx - 35} ${hy + 14} Q ${hx - 40} ${hy - 34} ${hx} ${hy - 34} Q ${hx + 40} ${hy - 34} ${hx + 35} ${hy + 14} L ${hx + 26} ${hy + 6} Q ${hx + 30} ${hy - 24} ${hx} ${hy - 26} Q ${hx - 30} ${hy - 24} ${hx - 26} ${hy + 6} Z" fill="${p.hair}"/>`
        : hair === 'bun'
          ? `<circle cx="${hx}" cy="${hy - 42}" r="13" fill="${p.hair}"/><path d="M ${hx - 33} ${hy - 2} A 33 33 0 0 1 ${hx + 33} ${hy - 2} L ${hx + 26} ${hy - 12} Q ${hx} ${hy - 24} ${hx - 26} ${hy - 12} Z" fill="${p.hair}"/>`
          : `<circle cx="${hx - 17}" cy="${hy - 26}" r="10" fill="${p.hair}"/><circle cx="${hx}" cy="${hy - 33}" r="11" fill="${p.hair}"/><circle cx="${hx + 17}" cy="${hy - 26}" r="10" fill="${p.hair}"/>`;
  const eyes = o.closedEyes
    ? cap(`M ${hx - 16} ${hy + 2} Q ${hx - 10} ${hy + 9} ${hx - 4} ${hy + 2}`, LINE, 4) +
      cap(`M ${hx + 4} ${hy + 2} Q ${hx + 10} ${hy + 9} ${hx + 16} ${hy + 2}`, LINE, 4)
    : `<circle cx="${hx - 11}" cy="${hy + 2}" r="3.6" fill="${LINE}"/><circle cx="${hx + 11}" cy="${hy + 2}" r="3.6" fill="${LINE}"/>`;
  const head =
    `<circle cx="${hx}" cy="${hy}" r="32" fill="${SKIN}" stroke="${LINE}" stroke-width="6"/>` +
    hairArt +
    `<circle cx="${hx - 33}" cy="${hy + 6}" r="5.5" fill="${SKIN}" stroke="${LINE}" stroke-width="3.5"/>` +
    `<circle cx="${hx + 33}" cy="${hy + 6}" r="5.5" fill="${SKIN}" stroke="${LINE}" stroke-width="3.5"/>` +
    cap(`M ${hx - 16} ${hy - 7} L ${hx - 6} ${hy - 7}`, LINE, 3.5) +
    cap(`M ${hx + 6} ${hy - 7} L ${hx + 16} ${hy - 7}`, LINE, 3.5) +
    eyes +
    cap(`M ${hx - 8} ${hy + 16} Q ${hx} ${hy + 23} ${hx + 8} ${hy + 16}`, LINE, 4);

  const upper =
    `<path d="M ${cx - 40} 190 Q ${cx} 166 ${cx + 40} 190 L ${cx + 31} 264 Q ${cx} 280 ${cx - 31} 264 Z" fill="${p.shirt}" stroke="${LINE}" stroke-width="5.5" stroke-linejoin="round"/>` +
    arms +
    // 脖子与头部同组倾斜——否则侧倾时头颈分离（2026-09-13 修复）
    `<g transform="rotate(${tilt} ${cx} 176)"><rect x="${cx - 9}" y="142" width="18" height="34" rx="7" fill="${SKIN2}"/>${head}</g>`;

  if (bend !== 0) {
    return `${legs}<g transform="rotate(${bend} ${cx} 292)">${upper}</g>`;
  }
  return `${legs}${upper}`;
}

/* ================= 头部侧视（颈部后缩/静蹲/走动共用） ================= */

/** 侧视头（朝右）：颅骨+鼻梁+发+耳+眼；dx=水平偏移 */
function sideHead(dx: number, hairColor: string): string {
  const hx = 292 + dx;
  const hy = 226;
  return (
    `<circle cx="${hx}" cy="${hy}" r="36" fill="${SKIN}" stroke="${LINE}" stroke-width="6"/>` +
    `<path d="M ${hx + 30} ${hy - 22} Q ${hx + 44} ${hy - 8} ${hx + 40} ${hy - 2} L ${hx + 47} ${hy + 5} L ${hx + 39} ${hy + 11} Q ${hx + 43} ${hy + 15} ${hx + 39} ${hy + 19} Q ${hx + 43} ${hy + 25} ${hx + 35} ${hy + 29} Q ${hx + 26} ${hy + 37} ${hx + 12} ${hy + 35}" stroke="${LINE}" stroke-width="5" stroke-linecap="round" fill="none"/>` +
    `<path d="M ${hx - 36} ${hy + 8} Q ${hx - 46} ${hy - 32} ${hx - 4} ${hy - 40} Q ${hx + 30} ${hy - 42} ${hx + 32} ${hy - 24} Q ${hx + 12} ${hy - 36} ${hx - 12} ${hy - 26} Q ${hx - 30} ${hy - 18} ${hx - 28} ${hy + 10} Z" fill="${hairColor}"/>` +
    `<circle cx="${hx - 8}" cy="${hy + 4}" r="7" fill="${SKIN2}" stroke="${LINE}" stroke-width="3.5"/>` +
    `<circle cx="${hx + 20}" cy="${hy - 2}" r="3.6" fill="${LINE}"/>`
  );
}

/* ================= 手掌特写（手腕放松专用） ================= */

/** 张开的手掌（掌心朝前、指朝上）：x=掌心横坐标，y=掌根纵坐标，s=缩放 */
function openPalm(x: number, y: number, s: number, fill: string): string {
  const R = (dx: number, dy: number, w: number, h: number, rx: number) =>
    `<rect x="${(x + dx * s - (w * s) / 2).toFixed(1)}" y="${(y + dy * s).toFixed(1)}" width="${(w * s).toFixed(1)}" height="${(h * s).toFixed(1)}" rx="${(rx * s).toFixed(1)}" fill="${fill}" stroke="${LINE}" stroke-width="${(4.2 * s).toFixed(1)}"/>`;
  return (
    R(-32, -92, 14, 76, 7) + // 食指
    R(-11, -104, 15, 90, 7.5) + // 中指
    R(11, -96, 14, 80, 7) + // 无名指
    R(31, -80, 13, 62, 6.5) + // 小指
    R(0, -52, 88, 62, 18) + // 掌
    `<rect x="${(x + 32 * s).toFixed(1)}" y="${(y - 54 * s).toFixed(1)}" width="${(38 * s).toFixed(1)}" height="${(16 * s).toFixed(1)}" rx="8" transform="rotate(-36 ${(x + 50 * s).toFixed(1)} ${(y - 44 * s).toFixed(1)})" fill="${fill}" stroke="${LINE}" stroke-width="${(4 * s).toFixed(1)}"/>` + // 拇指
    cap(`M ${x - 24 * s} ${y - 18 * s} Q ${x} ${y - 8 * s} ${x + 22 * s} ${y - 20 * s}`, LINE, 3) // 掌纹
  );
}

/* ================= 各动作插画 ================= */

export function guideIllustrations(): Record<string, string> {
  // 喝水 / 用药沿用 v2.1（未收到反馈问题）
  const cup = (level: number, accent: string) => {
    const topY = 180;
    const botY = 360;
    const fillY = botY - (botY - topY) * level;
    return `
      <path d="M 240 ${topY} L 252 ${botY} Q 254 382 278 382 L 362 382 Q 386 382 388 ${botY} L 400 ${topY} Z"
        fill="#FFFFFF" stroke="${LINE}" stroke-width="8" stroke-linejoin="round"/>
      <path d="M ${240 + 14 * (1 - level)} ${fillY} L 252 ${botY} Q 254 382 278 382 L 362 382 Q 386 382 388 ${botY} L ${400 - 14 * (1 - level)} ${fillY} Z" fill="#8FC9E8"/>
      <circle cx="295" cy="290" r="4" fill="${LINE}"/><circle cx="345" cy="290" r="4" fill="${LINE}"/>
      <path d="M 302 302 Q 320 314 338 302" stroke="${LINE}" stroke-width="4" stroke-linecap="round" fill="none"/>
      <circle cx="415" cy="200" r="12" fill="${accent}"/><circle cx="205" cy="330" r="9" fill="${accent}"/>
    `;
  };
  const cupArt = (level: number, accent: string, kind: 'sun' | 'moon' = 'sun') =>
    svgWrap(
      `${bg()}${kind === 'sun' ? `<circle cx="520" cy="90" r="30" fill="#FFC85C"/>` : `<path d="M 540 60 a 34 34 0 1 0 20 62 a 26 26 0 1 1 -20 -62" fill="#F5D982"/>`}${ground()}${cup(level, accent)}`,
    );

  // —— 颈部左右拉伸：正面人物头侧倾 + 弧向箭头 ——
  const neckArt = (n: 1 | 2) => {
    const tilt = n === 1 ? -20 : 20;
    const sgn = n === 1 ? -1 : 1;
    return frame(
      `${step(n)}
       ${personFront({ cx: 300, pal: 'coral', arm: 'down', tilt, hair: 'short' })}
       ${dash(`M ${300 + sgn * 84} 96 Q ${300 + sgn * 116} 122 ${300 + sgn * 102} 154`, '#F2825C')}
       <path d="M ${300 + sgn * 98} 166 L ${300 + sgn * 92} 146 L ${300 + sgn * 110} 150 Z" fill="#F2825C"/>`,
    );
  };

  // —— 肩部环绕：指尖搭肩 + 环绕弧（后/前方向相反） ——
  const shoulderArt = (n: 1 | 2) => {
    const sgn = n === 1 ? 1 : -1;
    const sweep = n === 1 ? 1 : 0;
    return frame(
      `${step(n)}
       ${personFront({ cx: 300, pal: 'teal', arm: 'shoulder', hair: 'bob' })}
       <path d="M ${300 + sgn * 96} 236 A 96 62 0 0 ${sweep} ${300 + sgn * 80} 116" stroke="#3FAE9E" stroke-width="8" stroke-linecap="round" fill="none" stroke-dasharray="3 14"/>
       <path d="M ${300 + sgn * 72} 112 L ${300 + sgn * 92} 120 L ${300 + sgn * 78} 134 Z" fill="#3FAE9E"/>
       ${label(n === 1 ? '双肩向后画圈' : '双肩向前画圈')}`,
    );
  };

  // —— 手腕放松：双手特写（十指交叉外翻 / 掌心外推），不画人 ——
  const wrist1 = frame(
    `${step(1)}
     ${cap('M 118 424 L 248 342', SKIN, 30)}
     ${cap('M 522 424 L 392 342', SKIN2, 30)}
     <g transform="rotate(-14 320 316)"><rect x="234" y="286" width="168" height="62" rx="30" fill="${SKIN}" stroke="${LINE}" stroke-width="6"/></g>
     <g transform="rotate(14 320 316)"><rect x="240" y="292" width="158" height="58" rx="28" fill="${SKIN2}" stroke="${LINE}" stroke-width="6" opacity=".94"/></g>
     ${[0, 1, 2, 3].map((i) => `<circle cx="${266 + i * 34}" cy="${322 - i * 6}" r="13" fill="${i % 2 ? SKIN2 : SKIN}" stroke="${LINE}" stroke-width="4.5"/>`).join('')}
     ${arrowLine(196, 258, 146, 220, '#C77E3C', 7)}
     ${arrowLine(444, 258, 494, 220, '#C77E3C', 7)}
     ${label('十指交叉，向外翻转')}`,
  );
  const wrist2 = frame(
    `${step(2)}
     ${openPalm(236, 330, 1.08, SKIN)}
     ${openPalm(404, 330, 1.08, SKIN2)}
     ${arrowLine(146, 296, 98, 296, '#C77E3C', 7)}
     ${arrowLine(494, 296, 542, 296, '#C77E3C', 7)}
     ${label('掌心向外推，保持 15 秒')}`,
  );

  // —— 体侧拉伸：双臂并拢上举 / 向左 C 形大弯 ——
  const stretch1 = frame(`${step(1)}${personFront({ cx: 300, pal: 'plum', arm: 'clasp', hair: 'bun' })}`);
  const stretch2 = frame(
    `${step(2)}
     ${personFront({ cx: 300, pal: 'plum', arm: 'clasp', hair: 'bun', bend: -22 })}
     ${dash('M 410 206 Q 452 278 410 350', '#9B7EC8')}
     <path d="M 414 362 L 420 342 L 400 346 Z" fill="#9B7EC8"/>
     ${cap('M 208 244 L 194 232', '#9B7EC8', 6)}
     ${cap('M 198 290 L 182 284', '#9B7EC8', 6)}`,
  );

  // —— 提肛：花朵收缩隐喻（收=花瓣内合+向心箭头 / 松=花瓣舒展+离心箭头） ——
  const kegelFlower = (contract: boolean) => {
    let petals = '';
    for (let k = 0; k < 8; k++) {
      const ang = k * 45 + (contract ? 8 : 0);
      const cy = contract ? 254 : 246;
      const rx = contract ? 20 : 17;
      const ry = contract ? 38 : 44;
      petals += `<ellipse cx="320" cy="${cy}" rx="${rx}" ry="${ry}" fill="${k % 2 ? '#F5B8C4' : '#F0A5B5'}" stroke="${LINE}" stroke-width="4.5" transform="rotate(${ang + (contract ? 14 : 0)} 320 300)"/>`;
    }
    const arrows = [0, 90, 180, 270]
      .map((deg) => {
        const a = ((deg - 90) * Math.PI) / 180;
        const inner = 92;
        const outer = contract ? 150 : 196;
        const xi = 320 + Math.cos(a) * inner;
        const yi = 300 + Math.sin(a) * inner;
        const xo = 320 + Math.cos(a) * outer;
        const yo = Math.min(300 + Math.sin(a) * outer, 412); // 底部箭头不压文字（label y=452）
        // 收缩：箭头指向中心（头在内端）；放松：箭头指向外（头在外端）
        return contract ? arrowLine(xo, yo, xi, yi, '#C77E3C', 7) : arrowLine(xi, yi, xo, yo, '#C77E3C', 7);
      })
      .join('');
    return (
      `<circle cx="320" cy="300" r="118" fill="none" stroke="#E8B9C4" stroke-width="5" stroke-dasharray="6 12" opacity=".8"/>` +
      petals +
      `<circle cx="320" cy="300" r="15" fill="${contract ? '#E5A83C' : '#FBE3B0'}" stroke="${LINE}" stroke-width="4.5"/>` +
      arrows +
      label(contract ? '收紧 3 秒' : '放松 3 秒')
    );
  };
  const kegel1 = frame(`${step(1)}${kegelFlower(true)}`, false);
  const kegel2 = frame(`${step(2)}${kegelFlower(false)}`, false);

  // —— 颈部后缩：侧视头（前伸龟颈 / 后收双下巴）+ 耳肩对位线 ——
  const torsoSide = (fill: string) =>
    `<path d="M 206 424 L 212 318 Q 214 284 246 278 L 258 282 Q 266 302 262 342 L 258 424 Z" fill="${fill}" stroke="${LINE}" stroke-width="5.5" stroke-linejoin="round"/>`;
  const neckRet1 = frame(
    `${step(1)}
     ${torsoSide(PAL.lake.shirt)}
     ${cap('M 254 276 L 322 254', SKIN, 20)}
     ${sideHead(58, PAL.lake.hair)}
     ${dash('M 342 272 L 342 420', '#5B94C9', 5)}
     ${dash('M 246 296 L 246 420', '#5B94C9', 5)}
     ${arrowLine(416, 220, 466, 220, '#5B94C9', 7)}
     ${label('头前伸：耳朵越过肩线')}`,
  );
  const neckRet2 = frame(
    `${step(2)}
     ${torsoSide(PAL.lake.shirt)}
     ${cap('M 250 276 L 250 252', SKIN, 20)}
     ${sideHead(-14, PAL.lake.hair)}
     ${cap('M 296 254 Q 308 262 320 256', LINE, 4)}
     ${dash('M 270 272 L 270 420', '#5B94C9', 5)}
     ${dash('M 246 296 L 246 420', '#5B94C9', 5)}
     ${arrowLine(186, 204, 136, 204, '#5B94C9', 7)}
     ${label('下巴水平后收：耳回肩上方')}`,
  );

  // —— 眼部：眼睛特写（远眺 / 闭眼），不画人 ——
  const eyeFar = frame(
    `${step(1)}
     <path d="M 150 240 Q 240 164 330 240 Q 240 312 150 240 Z" fill="#FFF" stroke="${LINE}" stroke-width="8" stroke-linejoin="round"/>
     <circle cx="240" cy="238" r="34" fill="#8FC9E8" stroke="${LINE}" stroke-width="6"/>
     <circle cx="240" cy="238" r="14" fill="${LINE}"/>
     <circle cx="250" cy="226" r="6" fill="#FFF"/>
     ${cap('M 208 180 L 200 164', LINE, 5)}${cap('M 240 172 L 240 154', LINE, 5)}${cap('M 272 180 L 280 164', LINE, 5)}
     ${dash('M 348 234 L 416 234', '#3FAE9E', 7)}
     <path d="M 420 234 L 400 222 L 400 246 Z" fill="#3FAE9E"/>
     <path d="M 470 268 L 512 208 L 554 268 Z" fill="#DDF2EE" stroke="#3FAE9E" stroke-width="7" stroke-linejoin="round"/>
     <path d="M 530 268 L 566 232 L 596 268" fill="none" stroke="#3FAE9E" stroke-width="7" stroke-linejoin="round"/>
     <circle cx="556" cy="150" r="22" fill="#FFC85C"/>`,
  );
  const eyeClose = frame(
    `${step(2)}
     ${cap('M 150 240 Q 240 302 330 240', LINE, 9)}
     ${cap('M 186 274 L 176 296', LINE, 6)}${cap('M 240 284 L 240 306', LINE, 6)}${cap('M 294 274 L 304 296', LINE, 6)}
     ${cap('M 176 196 Q 196 176 216 196', '#3FAE9E', 6)}
     ${cap('M 236 188 Q 256 168 276 188', '#3FAE9E', 6)}
     <path d="M 396 220 L 408 244 L 382 244 Z" fill="#FFC85C"/>
     <path d="M 448 236 L 456 254 L 436 254 Z" fill="#FFC85C" opacity=".7"/>
     ${label('缓慢眨眼，闭眼转动眼球')}`,
  );

  // —— 靠墙静蹲：侧视图（背贴墙站立 / 屈膝 90°） ——
  const wall = () =>
    `<rect x="150" y="132" width="26" height="296" fill="#D8D3CB"/>` +
    cap('M 150 190 L 176 190', '#C4BEB2', 5) +
    cap('M 150 252 L 176 252', '#C4BEB2', 5) +
    cap('M 150 314 L 176 314', '#C4BEB2', 5) +
    cap('M 150 376 L 176 376', '#C4BEB2', 5);
  const squat1 = frame(
    `${step(1)}
     ${wall()}
     ${cap('M 236 172 L 240 224 L 234 262', PAL.coral.shirt, 14)}
     <circle cx="236" cy="266" r="8" fill="${SKIN}" stroke="${LINE}" stroke-width="4"/>
     <path d="M 218 164 Q 216 154 228 154 L 240 156 Q 250 158 248 170 L 242 280 L 226 280 Z" fill="${PAL.coral.shirt}" stroke="${LINE}" stroke-width="5.5" stroke-linejoin="round"/>
     <rect x="220" y="272" width="36" height="24" rx="10" fill="${PAL.coral.pants}"/>
     ${cap('M 230 294 L 234 344 L 232 402', PAL.coral.pants, 16)}
     ${cap('M 232 408 L 270 410', SHOE, 13)}
     <circle cx="238" cy="128" r="28" fill="${SKIN}" stroke="${LINE}" stroke-width="5.5"/>
     <path d="M 264 124 Q 272 128 265 136" stroke="${LINE}" stroke-width="4" stroke-linecap="round" fill="none"/>
     <path d="M 212 122 A 28 28 0 0 1 264 120 Q 250 106 236 106 Q 222 106 212 122 Z" fill="${PAL.coral.hair}"/>
     <circle cx="232" cy="132" r="5.5" fill="${SKIN2}" stroke="${LINE}" stroke-width="3.5"/>
     <circle cx="250" cy="128" r="3.4" fill="${LINE}"/>`,
  );
  const squat2 = frame(
    `${step(2)}
     ${wall()}
     <path d="M 196 168 Q 194 158 206 158 L 218 160 Q 228 162 226 174 L 222 340 L 206 340 Z" fill="${PAL.coral.shirt}" stroke="${LINE}" stroke-width="5.5" stroke-linejoin="round"/>
     ${cap('M 212 182 L 246 252 L 284 306', PAL.coral.shirt, 14)}
     <circle cx="288" cy="310" r="8" fill="${SKIN}" stroke="${LINE}" stroke-width="4"/>
     <rect x="200" y="326" width="34" height="26" rx="10" fill="${PAL.coral.pants}"/>
     ${cap('M 214 338 L 304 344', PAL.coral.pants, 18)}
     ${cap('M 304 344 L 300 404', PAL.coral.pants, 16)}
     ${cap('M 300 408 L 338 410', SHOE, 13)}
     <circle cx="216" cy="132" r="28" fill="${SKIN}" stroke="${LINE}" stroke-width="5.5"/>
     <path d="M 242 128 Q 250 132 243 140" stroke="${LINE}" stroke-width="4" stroke-linecap="round" fill="none"/>
     <path d="M 190 126 A 28 28 0 0 1 242 124 Q 228 110 214 110 Q 200 110 190 126 Z" fill="${PAL.coral.hair}"/>
     <circle cx="210" cy="136" r="5.5" fill="${SKIN2}" stroke="${LINE}" stroke-width="3.5"/>
     <circle cx="228" cy="132" r="3.4" fill="${LINE}"/>
     <path d="M 282 344 A 24 24 0 0 0 304 320" stroke="${LINE}" stroke-width="3.5" fill="none"/>
     <text x="264" y="318" font-family="sans-serif" font-size="20" fill="${LINE}">90°</text>`,
  );

  // —— 起身走动：侧视（从座位起身 / 绕行远眺） ——
  const chair = () =>
    `<rect x="188" y="300" width="94" height="18" rx="8" fill="#D8D3CB" stroke="#B9B3A8" stroke-width="3"/>` +
    `<rect x="184" y="206" width="14" height="100" rx="7" fill="#D8D3CB" stroke="#B9B3A8" stroke-width="3"/>` +
    cap('M 194 318 L 194 424', '#B9B3A8', 9) +
    cap('M 274 318 L 274 424', '#B9B3A8', 9);
  const walk1 = frame(
    `${step(1)}
     ${chair()}
     ${cap('M 268 202 L 300 248 L 336 240', PAL.gold.shirt, 13)}
     <circle cx="342" cy="238" r="8" fill="${SKIN}" stroke="${LINE}" stroke-width="4"/>
     <path d="M 250 292 L 260 196 Q 261 186 272 188 L 280 190 Q 288 192 286 204 L 282 290 Z" fill="${PAL.gold.shirt}" stroke="${LINE}" stroke-width="5.5" stroke-linejoin="round"/>
     <circle cx="294" cy="160" r="27" fill="${SKIN}" stroke="${LINE}" stroke-width="5.5"/>
     <path d="M 319 156 Q 327 160 320 168" stroke="${LINE}" stroke-width="4" stroke-linecap="round" fill="none"/>
     <path d="M 270 154 A 27 27 0 0 1 320 152 Q 306 138 292 138 Q 279 138 270 154 Z" fill="${PAL.gold.hair}"/>
     <circle cx="288" cy="164" r="5.5" fill="${SKIN2}" stroke="${LINE}" stroke-width="3.5"/>
     <circle cx="306" cy="160" r="3.4" fill="${LINE}"/>
     ${cap('M 252 294 L 318 300', PAL.gold.pants, 17)}
     ${cap('M 318 300 L 312 402', PAL.gold.pants, 15)}
     ${cap('M 312 406 L 348 408', SHOE, 12)}
     ${dash('M 200 260 Q 226 250 244 262', '#E5A83C', 5)}`,
  );
  const walk2 = frame(
    `${step(2)}
     <circle cx="508" cy="112" r="26" fill="#FFC85C"/>
     <path d="M 448 300 L 486 252 L 524 300 Z" fill="#DDF2EE" stroke="#3FAE9E" stroke-width="6" stroke-linejoin="round"/>
     ${dash('M 208 300 L 258 300', '#B9B3A8', 6)}
     ${dash('M 194 332 L 248 332', '#B9B3A8', 6)}
     ${cap('M 316 202 L 344 246 L 338 286', PAL.gold.shirt, 13)}
     ${cap('M 310 202 L 282 248 L 288 288', PAL.gold.shirt, 13)}
     <circle cx="342" cy="290" r="8" fill="${SKIN}" stroke="${LINE}" stroke-width="4"/>
     <circle cx="286" cy="292" r="8" fill="${SKIN}" stroke="${LINE}" stroke-width="4"/>
     <path d="M 286 292 L 300 196 Q 302 186 313 188 L 321 190 Q 329 193 326 204 L 318 290 Z" fill="${PAL.gold.shirt}" stroke="${LINE}" stroke-width="5.5" stroke-linejoin="round"/>
     <circle cx="324" cy="148" r="27" fill="${SKIN}" stroke="${LINE}" stroke-width="5.5"/>
     <path d="M 349 144 Q 357 148 350 156" stroke="${LINE}" stroke-width="4" stroke-linecap="round" fill="none"/>
     <path d="M 300 142 A 27 27 0 0 1 350 140 Q 336 126 322 126 Q 309 126 300 142 Z" fill="${PAL.gold.hair}"/>
     <circle cx="318" cy="152" r="5.5" fill="${SKIN2}" stroke="${LINE}" stroke-width="3.5"/>
     <circle cx="336" cy="148" r="3.4" fill="${LINE}"/>
     ${cap('M 306 288 L 350 334 L 342 402', PAL.gold.pants, 16)}
     ${cap('M 342 406 L 378 408', SHOE, 12)}
     ${cap('M 296 290 L 262 330 L 248 396', PAL.gold.pants, 15)}
     ${cap('M 248 400 L 232 412', SHOE, 11)}`,
  );

  // —— 深呼吸：肺部节奏图（吸 4s / 屏 4s / 呼 6s），不画人 ——
  const lungs = (scale: number) =>
    `<g transform="translate(320 280) scale(${scale}) translate(-320 -280)">
       <rect x="306" y="126" width="28" height="66" rx="12" fill="#E8EEF4" stroke="${LINE}" stroke-width="5"/>
       ${cap('M 310 146 L 330 146', LINE, 3.5)}${cap('M 310 166 L 330 166', LINE, 3.5)}
       ${cap('M 312 192 L 278 216', LINE, 9)}${cap('M 328 192 L 362 216', LINE, 9)}
       <path d="M 278 216 Q 226 228 218 274 Q 212 326 240 346 Q 266 360 276 328 L 280 238 Q 282 222 278 216 Z" fill="#CFE8F7" stroke="#5B94C9" stroke-width="6" stroke-linejoin="round"/>
       <path d="M 362 216 Q 414 228 422 274 Q 428 326 400 346 Q 374 360 364 328 L 360 238 Q 358 222 362 216 Z" fill="#CFE8F7" stroke="#5B94C9" stroke-width="6" stroke-linejoin="round"/>
     </g>`;
  const breathe1 = frame(
    `${step(1)}
     ${lungs(1.05)}
     <circle cx="320" cy="84" r="6" fill="#8FC9E8"/><circle cx="308" cy="62" r="5" fill="#8FC9E8" opacity=".7"/><circle cx="332" cy="60" r="5" fill="#8FC9E8" opacity=".7"/>
     ${arrowLine(320, 30, 320, 92, '#5B94C9', 7)}
     ${label('吸气 4 秒')}`,
  );
  const breathe2 = frame(
    `${step(2)}
     ${lungs(1.05)}
     <circle cx="320" cy="272" r="128" fill="none" stroke="#8FC9E8" stroke-width="5" stroke-dasharray="5 14" opacity=".8"/>
     ${label('屏息 4 秒')}`,
  );
  const breathe3 = frame(
    `${step(3)}
     ${lungs(0.92)}
     <circle cx="320" cy="86" r="6" fill="#8FC9E8"/><circle cx="306" cy="64" r="5" fill="#8FC9E8" opacity=".7"/><circle cx="334" cy="66" r="5" fill="#8FC9E8" opacity=".7"/>
     ${arrowLine(320, 118, 320, 52, '#5B94C9', 7)}
     ${label('呼气 6 秒')}`,
  );

  // —— 起身活动（久坐计划配图）：站立伸展 / 拉伸 ——
  const standup1 = frame(
    `${step(1)}
     ${personFront({ cx: 280, pal: 'coral', arm: 'clasp', hair: 'bob' })}
     ${arrowLine(436, 330, 436, 200, '#F2825C', 10)}`,
  );
  const standup2 = frame(
    `${step(2)}
     ${personFront({ cx: 280, pal: 'coral', arm: 'up', hair: 'bob' })}
     ${dash('M 420 250 Q 452 300 424 352', '#F2825C')}`,
  );

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

    // ===== 微运动组图 v3.0 =====
    'neck-1': neckArt(1),
    'neck-2': neckArt(2),
    'shoulder-1': shoulderArt(1),
    'shoulder-2': shoulderArt(2),
    'wrist-1': wrist1,
    'wrist-2': wrist2,
    'stretch-1': stretch1,
    'stretch-2': stretch2,
    'kegel-1': kegel1,
    'kegel-2': kegel2,
    'neck-ret-1': neckRet1,
    'neck-ret-2': neckRet2,
    'eye-far': eyeFar,
    'eye-close': eyeClose,
    'squat-1': squat1,
    'squat-2': squat2,
    'walk-1': walk1,
    'walk-2': walk2,
    'breathe-1': breathe1,
    'breathe-2': breathe2,
    'breathe-3': breathe3,
    'standup-1': standup1,
    'standup-2': standup2,
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
  // AI 生成的额外插画（ARK 重绘）：目录内已有但不在上方 SVG 清单的 webp 一并注册，
  // 否则 seed 的 img(name) 取不到 → 数据库被写成 null（2026-09-13 眼部图丢失根因）
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.webp')) {
      const name = f.replace(/\.webp$/, '');
      if (!urls[name]) urls[name] = `/uploads/guide/${name}.webp`;
    }
  }
  return urls;
}
