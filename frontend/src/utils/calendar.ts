/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3V0aWxzL2NhbGVuZGFyLnRzfDIwMjYtMDl8OTA0MGEwYjY3NQ== */ */
import { Solar } from 'lunar-javascript';

/**
 * 日期工具：日历视图（日期切换/农历/节日）。
 * 依赖 lunar-javascript（npm 包）。
 */

/** Date → YYYY-MM-DD（本地） */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

/** YYYY-MM-DD 加减 n 天 */
export function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dateKey(dt);
}

/** 日期标签：今天/明天/昨天/前天/后天，否则 M月D日 */
export function dayLabel(key: string, today: string): string {
  if (key === today) return '今天';
  const diff = Math.round(
    (new Date(key + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86_400_000,
  );
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff === 2) return '后天';
  if (diff === -2) return '前天';
  const [, m, d] = key.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

/** 完整日期头："8月19日 周三" */
export function dateHead(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const week = ['日', '一', '二', '三', '四', '五', '六'][new Date(y, m - 1, d).getDay()];
  return `${m}月${d}日 周${week}`;
}

/** 农历 + 节日信息 */
export function lunarInfo(key: string): { lunar: string; festival: string | null } {
  const [y, m, d] = key.split('-').map(Number);
  const solar = Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();
  // 节日优先：公历节日 + 农历节日
  const festivals = [...solar.getFestivals(), ...lunar.getFestivals()];
  return {
    lunar: lunar.toString(),
    festival: festivals.length > 0 ? festivals[0] : null,
  };
}

/** 节日 → 合理图标 */
export function festivalIcon(name: string): string {
  if (name.includes('春节') || name.includes('元宵')) return '🏮';
  if (name.includes('端午')) return '🛶';
  if (name.includes('中秋')) return '🌕';
  if (name.includes('七夕')) return '🌌';
  if (name.includes('国庆')) return '🎆';
  if (name.includes('元旦') || name.includes('新年')) return '🎊';
  if (name.includes('圣诞')) return '🎄';
  if (name.includes('清明')) return '🌿';
  if (name.includes('重阳')) return '🌼';
  if (name.includes('劳动')) return '💪';
  if (name.includes('妇女')) return '🌸';
  if (name.includes('儿童')) return '🎈';
  if (name.includes('教师')) return '📚';
  if (name.includes('父亲')) return '👨';
  if (name.includes('母亲')) return '👩';
  if (name.includes('腊八')) return '🥣';
  if (name.includes('小年')) return '🧹';
  if (name.includes('情人节')) return '💝';
  return '🎉';
}

/** 快捷导航序列：3天前/前天/昨天/今天/明天/后天/3天后 */
export function navKeys(today: string): { key: string; label: string }[] {
  return [-3, -2, -1, 0, 1, 2, 3].map((off) => ({
    key: shiftKey(today, off),
    label:
      off === 0 ? '今天' : off === -1 ? '昨天' : off === 1 ? '明天' : off === -2 ? '前天' : off === 2 ? '后天' : `${Math.abs(off)}天${off > 0 ? '后' : '前'}`,
  }));
}
