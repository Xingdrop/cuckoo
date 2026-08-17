import { Bell, CalendarCheck, Home, Settings } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/today', label: '今日', icon: Home },
  { to: '/reminders', label: '提醒', icon: CalendarCheck },
  { to: '/notifications', label: '通知', icon: Bell },
  { to: '/settings', label: '设置', icon: Settings },
];

/** 底部导航（PWA 移动端主导航，安全区适配） */
export function BottomNav() {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-surface">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                isActive ? 'text-primary-600' : 'text-ink-300'
              }`
            }
          >
            <Icon size={22} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
