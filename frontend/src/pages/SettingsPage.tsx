import { Award, BarChart3, Bell, BellRing, ChevronLeft, Database, Download, LogOut, Shield, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { ConfirmModal } from '../components/ConfirmModal';
import { ReminderOverlay } from '../features/reminders/ReminderOverlay';
import { authApi } from '../services/api/api.auth';
import { usersApi } from '../services/api/api.users';
import { errorMessage } from '../services/http';
import { useAuthStore } from '../stores/authStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useGuestStore } from '../guest/guestStore';
import { useLocal } from '../guest/localMode';
import { checkPushSubscribed, isPushSupported, pushFailMessage, subscribePush, unsubscribePush } from '../utils/push';
import type { Reminder, UserSettings } from '../types';

/** 设置开关行：#24 自绘 pill 开关（原生 checkbox 在手机端勾选后颜色突变，统一主题色+过渡动画） */
function SettingRow({
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
        <p className={`text-sm ${disabled ? 'text-ink-500' : ''}`}>{label}</p>
        <p className={`mt-0.5 text-xs ${disabled ? 'text-ink-500/70' : 'text-ink-500'}`}>{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 disabled:opacity-40 ${
          checked ? 'justify-end bg-primary-500' : 'justify-start bg-ink-200'
        }`}
      >
        <span className="h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200" />
      </button>
    </div>
  );
}

/** 测试提醒的临时数据（本地弹窗验证用，不进数据库） */
const TEST_REMINDER: Reminder = {
  id: 'test-reminder',
  userId: '',
  category: 'water',
  categoryLabel: null,
  categoryIcon: null,
  title: '这是一条测试提醒',
  repeatRule: { type: 'once' },
  startDate: new Date().toISOString(),
  times: null,
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
  const online = useConnectionStore((s) => s.online);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [pushSupport, setPushSupport] = useState<boolean>(isPushSupported());
  const [showTest, setShowTest] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const guestActive = useGuestStore((s) => s.active);
  const [hasGuestData, setHasGuestData] = useState(() => localStorage.getItem('cuckoo_local:guest') !== null);

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
        await unsubscribePush();
        setPushEnabled(false);
      } else {
        const result = await subscribePush();
        setPushEnabled(result.ok);
        if (!result.ok) setError(pushFailMessage(result.reason));
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

  /** #24：导出全量数据——离线/游客直接用本地数据打包（json 下载），任何状态可用 */
  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      if (useLocal()) {
        const g = useGuestStore.getState();
        const bundle = g.exportBundle();
        const blob = new Blob([JSON.stringify({ ...bundle, exportedAt: new Date().toISOString() }, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cuckoo-local-data-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await usersApi.exportData();
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** 注销账号（FR-105/AC-106） */
  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await usersApi.deleteAccount();
      logout();
      navigate('/login', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  const settingsRows = [
    { key: 'notificationEnabled' as const, label: '提醒通知', desc: '到点触发全屏提醒' },
    { key: 'soundEnabled' as const, label: '响铃', desc: '提醒时播放铃声' },
    { key: 'vibrationEnabled' as const, label: '震动', desc: '提醒时震动' },
    { key: 'showSkipButton' as const, label: '显示跳过按钮', desc: '关闭后提醒只能完成或延迟' },
  ];

  return (
    <div className="mx-auto max-w-md pb-20">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-bg/95 px-4 py-3 backdrop-blur">
        <button
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center text-ink-700"
          aria-label="返回"
        >
          <ChevronLeft size={22} />
        </button>
        <div>
          <h1 className="text-lg font-semibold">设置</h1>
          {user ? (
            <p className="text-xs text-ink-500">@{user.username}</p>
          ) : (
            <p className="text-xs text-ink-500">游客（本地账户）· 本地保存</p>
          )}
        </div>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {notice && (
          <p className="rounded-btn bg-primary-50 px-3 py-2 text-xs font-medium text-primary-700">✓ {notice}</p>
        )}
        {error && (
          <p className="rounded-btn bg-danger-50 px-3 py-2 text-xs font-medium text-danger-600">{error}</p>
        )}
        {/* 账号卡（顶部：快捷退出登录；游客 = 本地账户） */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-lg font-semibold text-primary-600">
              {user ? (
                user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="头像" className="h-full w-full object-cover" />
                ) : (
                  user.username.slice(0, 1).toUpperCase()
                )
              ) : (
                '🎒'
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {user ? `@${user.username}` : '游客（本地账户）'}
              </p>
              <p className="text-[11px] text-ink-500">
                {user ? '健康提醒 · 坚持每天' : '数据仅存本机 · 所有本地功能可用'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="flex h-9 items-center gap-1 rounded-full bg-danger-500/10 px-3.5 text-xs font-medium text-danger-600"
            >
              <LogOut size={14} /> {user ? '退出登录' : '退出游客模式'}
            </button>
          </div>
        </section>

        {error && (
          <p className="rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{error}</p>
        )}

        {/* 通知偏好（每个选项独立） */}
        <section className="divide-y divide-ink-100 rounded-card bg-surface shadow-sm">
          <h2 className="px-4 py-3 text-sm font-medium">通知偏好</h2>
          {settingsRows.map((row) => (
            <SettingRow
              key={row.key}
              label={row.label}
              desc={row.desc}
              checked={settings?.[row.key] ?? false}
              disabled={!settings}
              onChange={(v) => update({ [row.key]: v })}
            />
          ))}
        </section>

        {/* 浏览器推送（离线置灰：需服务器签约） */}
        <section className="rounded-card bg-surface shadow-sm">
          <SettingRow
            label="浏览器推送"
            desc={
              !online
                ? '离线状态不可用（联网后可在浏览器端使用）'
                : pushEnabled === null
                  ? '检测中…'
                  : pushSupport
                    ? '页面关闭时也能收到提醒（通道 B）'
                    : '当前浏览器/环境不支持推送（需 HTTPS 或 localhost）'
            }
            checked={pushEnabled ?? false}
            disabled={!online || pushEnabled === null || !pushSupport || busy}
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

        {/* 我的数据（M5：报告/成就/导出）——离线置灰（需联网） */}
        <section className="divide-y divide-ink-100 rounded-card bg-surface shadow-sm">
          <h2 className="px-4 py-3 text-sm font-medium">我的数据</h2>
          <button
            onClick={() => navigate('/reports')}
            disabled={!online}
            title={!online ? '该功能需联网' : undefined}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-40"
          >
            <BarChart3 size={18} className="shrink-0 text-primary-600" />
            <div>
              <p className="text-sm font-medium">周报 / 月报</p>
              <p className="mt-0.5 text-xs text-ink-500">完成率、分类统计与建议（周一/1 日自动生成）</p>
            </div>
            {!online && <span className="ml-auto text-[10px] text-ink-400">需联网</span>}
          </button>
          <button
            onClick={() => navigate('/achievements')}
            disabled={!online}
            title={!online ? '该功能需联网' : undefined}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-40"
          >
            <Award size={18} className="shrink-0 text-primary-600" />
            <div>
              <p className="text-sm font-medium">成就墙</p>
              <p className="mt-0.5 text-xs text-ink-500">连续坚持、用药/锻炼/喝水成就</p>
            </div>
            {!online && <span className="ml-auto text-[10px] text-ink-400">需联网</span>}
          </button>
          <button
            onClick={handleExport}
            disabled={busy}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-40"
          >
            <Download size={18} className="shrink-0 text-primary-600" />
            <div>
              <p className="text-sm font-medium">导出我的数据</p>
              <p className="mt-0.5 text-xs text-ink-500">下载 JSON（提醒/日志/药品/计划/设置全量；离线也可用）</p>
            </div>
          </button>
          {/* #22：合并游客数据（默认不同步；开关 = 手动把游客数据并入当前账户，重复按更新时间较新） */}
          <div className="flex w-full items-center gap-3 px-4 py-3.5">
            <Database size={18} className="shrink-0 text-primary-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">合并游客数据</p>
              <p className="mt-0.5 text-xs text-ink-500">
                把游客模式的数据并入当前账户（重复内容按更新时间较新保留）；游客数据默认不会自动同步
              </p>
            </div>
            <button
              onClick={async () => {
                try {
                  const r = useGuestStore.getState().mergeGuestData();
                  setHasGuestData(localStorage.getItem('cuckoo_local:guest') !== null);
                  setError(null);
                  setNotice(
                    r.merged > 0
                      ? `已合并 ${r.merged} 条游客数据到当前账户${r.skipped > 0 ? `，${r.skipped} 条重复按更新时间保留了较新版本` : ''}`
                      : '暂无游客数据可合并（或已合并过）',
                  );
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
              disabled={guestActive || !hasGuestData}
              title={guestActive ? '请先退出游客模式并登录账户' : !hasGuestData ? '本机没有游客数据' : '合并游客数据'}
              className="shrink-0 rounded-full bg-primary-500 px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-40 disabled:pointer-events-none"
            >
              {guestActive ? '需登录账户' : !hasGuestData ? '暂无游客数据' : '合并'}
            </button>
          </div>
        </section>

        {/* 账号 */}
        <section className="divide-y divide-ink-100 rounded-card bg-surface shadow-sm">
          <button
            onClick={() => navigate('/privacy')}
            className="flex w-full items-center gap-2 px-4 py-3.5 text-sm text-ink-700"
          >
            <Shield size={16} /> 隐私政策与健康免责声明
          </button>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-4 py-3.5 text-sm text-ink-700"
          >
            <LogOut size={16} /> 退出登录
          </button>
          {guestActive ? (
            /* #24：游客 = 本地账户 → 注销 = 清空本地游客数据（无需联网） */
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center gap-2 px-4 py-3.5 text-sm text-danger-500"
            >
              <Trash2 size={16} /> 注销（清空游客本地数据）
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={!online}
              title={!online ? '注销账号需联网' : undefined}
              className="flex w-full items-center gap-2 px-4 py-3.5 text-sm text-danger-500 disabled:opacity-40"
            >
              <Trash2 size={16} /> 注销账号
            </button>
          )}
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

      {/* 注销确认（#24：游客 = 清空本地游客数据；账户 = 服务端注销） */}
      <ConfirmModal
        open={confirmDelete}
        title={guestActive ? '确认清空游客数据？' : '确认注销账号？'}
        message={
          guestActive
            ? '将清除本机游客模式的全部数据（提醒/记录/计划/设置），且无法恢复。如需保留请先登录账户并执行「合并游客数据」。'
            : '注销后将删除该账号全部数据（提醒/记录/帖子等），审计日志留存；注销后旧登录状态立即失效。'
        }
        confirmText={guestActive ? '确认清空' : '确认注销'}
        cancelText="取消"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (guestActive) {
            useGuestStore.getState().clearGuestData();
            setConfirmDelete(false);
            setNotice('游客数据已清空（本机本地账户已注销）');
          } else {
            await handleDelete();
          }
        }}
      />
    </div>
  );
}
