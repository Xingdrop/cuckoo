// /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL2NvbXBvbmVudHMvQmlyZE1hc2NvdC50c3h8MjAyNi0wOXw5ODE1NzEwMzM4 */
/**
 * 布谷鸟吉祥物（极简几何鸟，与图标同源语言）：
 * 颜色走 CSS 变量——跟随主题（蜜桃/青翠/冰岛）自动换色；描边风格与插画体系统一。
 */
export function BirdMascot({ size = 96, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="布谷鸟"
    >
      <circle cx="48" cy="48" r="44" fill="var(--color-primary-100)" />
      {/* 简化鸟：圆头 + 三角喙 + 一根翅线，无多余细节 */}
      <circle cx="45" cy="42" r="17" fill="var(--color-primary-500)" />
      <path d="M60 41 L70 44.5 L60 48 Z" fill="var(--color-accent-500)" />
      <circle cx="40" cy="39" r="2.6" fill="#fff" />
      <circle cx="40.9" cy="39.4" r="1.3" fill="#22302C" />
      <path d="M36 47 Q45 55 56 49" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".85" />
      <path d="M32 46 Q24 50 22 58" stroke="var(--color-primary-600)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      {/* 小音符 */}
      <circle cx="66" cy="30" r="2.6" fill="var(--color-primary-400)" />
      <path d="M68.4 29 V20 q4 1 4 4" stroke="var(--color-primary-400)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}
