/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL2NvbXBvbmVudHMvQm90dG9tTmF2LnRzeHwyMDI2LTA5fGNmYTQ4NWQ1MzA= */
import { CalendarCheck, Home, Users } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/today', label: '今日', icon: Home },
  { to: '/reminders', label: '提醒', icon: CalendarCheck },
  { to: '/social', label: '社交', icon: Users },
];

/**
 * 底部导航 v2：激活项为「药丸高亮」，视觉层级更清楚；
 * 纯色背景（无 backdrop-blur）+ 无全局 transition——移动端滑动/切换零重绘卡顿。
 */
export function BottomNav() {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-surface">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="flex flex-1 justify-center">
            {({ isActive }) => (
              <span
                className={`my-1.5 flex w-[86px] flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] ${
                  isActive ? 'bg-primary-50 font-semibold text-primary-600' : 'text-ink-300'
                }`}
              >
                <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} />
                {label}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
