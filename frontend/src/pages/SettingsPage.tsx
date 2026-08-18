import { Bell, LogOut, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { authApi } from '../services/api/api.auth';
import { errorMessage } from '../services/http';
import { useAuthStore } from '../stores/authStore';
import { isPushSupported, subscribePush } from '../utils/push';
import type { UserSettings } from '../types';

/**
 * P-18 设置（FR-104）
 * 通知偏好 + Web Push 订阅 + 账号退出（导出/注销 M5）
 */
export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authApi
      .getSettings()
      .then(setSettings)
      .catch((e) => setError(errorMessage(e)));
    // 当前是否已订阅 Push
    if (isPushSupported()) {
      navigator.serviceWorker.ready
        .then((sw) => sw.pushManager.getSubscription())
        .then((sub) => setPushEnabled(Boolean(sub)))
        .catch(() => setPushEnabled(false));
    } else {
      setPushEnabled(false);
    }
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
        if (!ok) setError('通知权限未开启或后端未配置推送服务');
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

        {/* 通知偏好 */}
        <section className="rounded-card bg-surface shadow-sm">
          <h2 className="border-b border-ink-100 px-4 py-3 text-sm font-medium">通知偏好</h2>
          {[
            { key: 'notificationEnabled' as const, label: '提醒通知', desc: '到点触发全屏提醒' },
            { key: 'soundEnabled' as const, label: '响铃', desc: '提醒时播放铃声' },
            { key: 'vibrationEnabled' as const, label: '震动', desc: '提醒时震动' },
            { key: 'showSkipButton' as const, label: '显示跳过按钮', desc: '关闭后提醒只能完成或延迟' },
          ].map((row) => (
            <div key={row.key} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm">{row.label}</p>
                <p className="text-xs text-ink-300">{row.desc}</p>
              </div>
              <input
                type="checkbox"
                checked={settings?.[row.key] ?? false}
                disabled={!settings}
                onChange={(e) => update({ [row.key]: e.target.checked })}
                className="h-5 w-5 accent-primary-500"
              />
            </div>
          ))}
        </section>

        {/* 推送订阅 */}
        <section className="rounded-card bg-surface shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Smartphone size={18} className="text-ink-500" />
              <div>
                <p className="text-sm">浏览器推送</p>
                <p className="text-xs text-ink-300">页面关闭时也能收到提醒（通道 B）</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={pushEnabled ?? false}
              disabled={pushEnabled === null || busy}
              onChange={togglePush}
              className="h-5 w-5 accent-primary-500"
            />
          </div>
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

        <p className="flex items-center justify-center gap-1 pt-2 text-xs text-ink-300">
          <Bell size={12} /> 布谷 Cuckoo v0.1 · 准时提醒，温柔守护
        </p>
      </main>

      <BottomNav />
    </div>
  );
}
