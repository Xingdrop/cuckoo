/**
 * 布谷鸟吉祥物（与 App 图标同源的 chibi 布谷鸟，内联 SVG）：
 * 用于空态/引导等品牌露出场景——比 emoji 更贴合「可爱布谷鸟」的产品形象。
 */
export function BirdMascot({ size = 96, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="布谷鸟"
    >
      <defs>
        <linearGradient id="birdBgG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2E7D6B" />
          <stop offset="1" stopColor="#54B39A" />
        </linearGradient>
        <linearGradient id="birdFaceG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#F3FAF6" />
        </linearGradient>
      </defs>
      {/* 圆底 */}
      <circle cx="256" cy="256" r="236" fill="url(#birdBgG)" />
      {/* 钟盘（简化：鸟栖在钟上） */}
      <circle cx="256" cy="356" r="150" fill="url(#birdFaceG)" />
      <circle cx="256" cy="356" r="150" fill="none" stroke="#DCEAE4" strokeWidth="8" />
      <path d="M256 356 L188 302" stroke="#2E7D6B" strokeWidth="20" strokeLinecap="round" fill="none" />
      <path d="M256 356 L322 308" stroke="#2E7D6B" strokeWidth="20" strokeLinecap="round" fill="none" />
      <circle cx="256" cy="356" r="16" fill="#F2A65A" />
      <circle cx="256" cy="356" r="6" fill="#E08F3F" />
      {/* 鸟（去尾羽简化版，居中偏上） */}
      <ellipse cx="252" cy="170" rx="86" ry="70" fill="#256557" />
      <ellipse cx="262" cy="198" rx="46" ry="34" fill="#F6EFE3" />
      <path d="M236 106 Q230 82 248 74 Q250 92 244 104 Z" fill="#1F5A4F" />
      <path d="M256 102 Q258 76 278 72 Q274 92 262 104 Z" fill="#2E7D6B" />
      <path d="M186 158 Q150 162 142 196 Q176 208 204 188 Q192 172 186 158 Z" fill="#35836F" />
      <circle cx="230" cy="150" r="19" fill="#FFFFFF" />
      <circle cx="286" cy="150" r="19" fill="#FFFFFF" />
      <circle cx="233" cy="153" r="10" fill="#22302C" />
      <circle cx="289" cy="153" r="10" fill="#22302C" />
      <circle cx="236" cy="149" r="4" fill="#FFFFFF" />
      <circle cx="292" cy="149" r="4" fill="#FFFFFF" />
      <ellipse cx="204" cy="176" rx="10" ry="7" fill="#F7A8B8" opacity="0.85" />
      <ellipse cx="312" cy="176" rx="10" ry="7" fill="#F7A8B8" opacity="0.85" />
      <path d="M316 162 L352 172 L318 186 Z" fill="#F2A65A" />
      <path d="M318 178 L340 182 L320 188 Z" fill="#E08F3F" />
      {/* 歌符 */}
      <g fill="#FFD98A">
        <ellipse cx="396" cy="120" rx="13" ry="10" transform="rotate(-18 396 120)" />
        <rect x="404" y="76" width="7" height="46" rx="3.5" />
        <path d="M404 76 Q428 80 430 100 Q418 94 404 96 Z" />
      </g>
    </svg>
  );
}
