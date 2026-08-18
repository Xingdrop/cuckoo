import { Bell, BellRing, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { ReminderOverlay } from '../features/reminders/ReminderOverlay';
import { authApi } from '../services/api/api.auth';
import { errorMessage } from '../services/http';
import { useAuthStore } from '../stores/authStore';
import { checkPushSubscribed, isPushSupported, subscribePush } from '../utils/push';
import type { Reminder, UserSettings } from '../types';

/** 开关组件：清晰的独立选项样式 */
function Switch({
  checked,
  onChange,
  disabled,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  desc: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="min-w-0 pr-3">
        <p className={`text-sm ${disabled ? 'text-ink-300' : ''}`}>{label}</p>
        <p className={`mt-0.5 text-xs ${disabled ? 'text-ink-300/60' : 'text-ink-500'}`}>{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          disabled ? 'bg-ink-100 opacity-60' : checked ? 'bg-primary-500' : 'bg-ink-100'
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}

/** 测试提醒的临时数据（本地弹窗验证用，不进数据库） */
const TEST_REMINDER: Reminder = {
  id: 'test-reminder',
  userId: '',
  category: 'water',
  title: '这是一条测试提醒',
  repeatRule: { type: 'once' },
  startDate: new Date().toISOString(),
  endDate: null,
  nextTriggerAt: new Date().toISOString(),
  content: { text: '全屏提醒功能正常！你可以点击完成、延迟或跳过。' },
  method: { fullScreen: true },
  delaySettings: { presetOptions: [5, 10], maxDelayCount: 3 },
  challenge: { enabled: false, allowGallery: true },
  medicineId: null,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * P-18 设置（FR-104）
 * 通知偏好（独立开关）+ Web Push 订阅 + 测试提醒 + 账号退出
 */
export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [pushSupport, setPushSupport] = useState<boolean>(isPushSupported());
  const [showTest, setShowTest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authApi
      .getSettings()
      .then(setSettings)
      .catch((e) => setError(errorMessage(e)));
    void checkPushSubscribed().then((ok) => {
      setPushEnabled(ok);
      setPushSupport(isPushSupported());
    });
  }, []);

  const update = async (patch: Partial<UserSettings>) => {
    setError(null);
    try {
      setSettings(await authApi.updateSettings(patch));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const togglePush = async () => {
    setBusy(true);
    setError(null);
    try {
      if (pushEnabled) {
        await import('../utils/push').then((m) => m.unsubscribePush());
        setPushEnabled(false);
      } else {
        const ok = await subscribePush();
        setPushEnabled(ok);
        if (!ok) setError('通知权限未开启或浏览器不支持推送');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const settingsRows = [
    { key: 'notificationEnabled' as const, label: '提醒通知', desc: '到点触发全屏提醒' },
    { key: 'soundEnabled' as const, label: '响铃', desc: '提醒时播放铃声' },
    { key: 'vibrationEnabled' as const, label: '震动', desc: '提醒时震动' },
    { key: 'showSkipButton' as const, label: '显示跳过按钮', desc: '关闭后提醒只能完成或延迟' },
  ];

  return (
    <div className="mx-auto max-w-md pb-20">
      <header className="px-4 pt-6">
        <h1 className="text-xl font-semibold">设置</h1>
        {user && <p className="mt-1 text-sm text-ink-500">@{user.username}</p>}
      </header>

      <main className="space-y-4 px-4 pt-4">
        {error && (
          <p className="rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{error}</p>
        )}

        {/* 通知偏好（每个选项独立开关） */}
        <section className="divide-y divide-ink-100 rounded-card bg-surface shadow-sm">
          <h2 className="px-4 py-3 text-sm font-medium">通知偏好</h2>
          {settingsRows.map((row) => (
            <Switch
              key={row.key}
              label={row.label}
              desc={row.desc}
              checked={settings?.[row.key] ?? false}
              disabled={!settings}
              onChange={(v) => update({ [row.key]: v })}
            />
          ))}
        </section>

        {/* 浏览器推送 */}
        <section className="rounded-card bg-surface shadow-sm">
          <Switch
            label="浏览器推送"
            desc={
              pushEnabled === null
                ? '检测中…'
                : pushSupport
                  ? '页面关闭时也能收到提醒（通道 B）'
                  : '当前浏览器/环境不支持推送（需 HTTPS 或 localhost）'
            }
            checked={pushEnabled ?? false}
            disabled={pushEnabled === null || !pushSupport || busy}
            onChange={togglePush}
          />
        </section>

        {/* 测试提醒 */}
        <section className="rounded-card bg-surface shadow-sm">
          <button
            onClick={() => setShowTest(true)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
          >
            <BellRing size={18} className="shrink-0 text-primary-600" />
            <div>
              <p className="text-sm font-medium">测试提醒</p>
              <p className="mt-0.5 text-xs text-ink-500">立即弹出全屏提醒，验证触发效果</p>
            </div>
          </button>
        </section>

        {/* 账号 */}
        <section className="rounded-card bg-surface shadow-sm">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-4 py-3.5 text-sm text-danger-500"
          >
            <LogOut size={16} /> 退出登录
          </button>
        </section>

        <p className="flex items-center justify-center gap-1 pt-2 text-xs text-ink-500">
          <Bell size={12} /> 布谷 Cuckoo v0.1 · 准时提醒，温柔守护
        </p>
      </main>

      <BottomNav />

      {/* 测试全屏提醒 */}
      {showTest && (
        <ReminderOverlay
          reminder={TEST_REMINDER}
          onAction={async () => {
            setShowTest(false);
          }}
        />
      )}
    </div>
  );
}
