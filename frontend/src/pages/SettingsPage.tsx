/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3BhZ2VzL1NldHRpbmdzUGFnZS50c3h8MjAyNi0wOXwxMGVlM2RkNWJj */
import { Award, BarChart3, Bell, BellRing, ChevronLeft, Database, Download, LogOut, Shield, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { ConfirmModal } from '../components/ConfirmModal';
import { ReminderOverlay } from '../features/reminders/ReminderOverlay';
import { authApi } from '../services/api/api.auth';
import { usersApi } from '../services/api/api.users';
import { appApi, type AppApkInfo } from '../services/api/api.app';
import { loadAiConfig, saveAiConfig } from '../assistant/assistant';
import { refreshApiBase, absoluteUrl } from '../services/http';
import { errorMessage } from '../services/http';
import { loadInputMode, saveInputMode, type VoiceInputMode } from '../features/voice/voicePref';
import { exportPhotosToPhone } from '../services/photoExport';
import { RImg } from '../components/remoteMedia';
import { useAuthStore } from '../stores/authStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useGuestStore } from '../guest/guestStore';
import { THEMES, useThemeStore, type ThemeId } from '../stores/themeStore';
import { useLocal } from '../guest/localMode';
import { checkPushSubscribed, isPushSupported, pushFailMessage, subscribePush, unsubscribePush } from '../utils/push';
import type { Reminder, UserSettings } from '../types';

/** 设置开关行：#25 自绘打勾框——保留 ✓ 语义，开关两态颜色恒定、平滑过渡（原生 checkbox 手机端变色突兀） */
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
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-200 disabled:opacity-40"
        style={{
          borderColor: checked ? 'var(--color-primary-500)' : 'var(--color-ink-300)',
          backgroundColor: checked ? 'var(--color-primary-500)' : 'transparent',
        }}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6.5 4.5 9 10 3" />
          </svg>
        )}
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
  const { theme, setTheme } = useThemeStore();
  const [hasGuestData, setHasGuestData] = useState(() => localStorage.getItem('cuckoo_local:guest') !== null);
  /** #26：合并预览弹窗（确认后合并）/ 清空游客数据确认 */
  const [previewMerge, setPreviewMerge] = useState<string | null>(null);
  const [confirmClearGuest, setConfirmClearGuest] = useState(false);
  /** #26：AI 助手配置（本地保密存储） */
  const [ai, setAi] = useState(() => loadAiConfig());
  /** 底部语音按钮方式：语音识别 / 直接打字（仅存本机，与悬浮按钮实时同步） */
  const [inputMode, setInputMode] = useState<VoiceInputMode>(loadInputMode);
  /** AI 测试连接结果（居中弹窗展示，不用顶部提示） */
  const [aiTestResult, setAiTestResult] = useState<string | null>(null);
  /** #26：服务器地址输入 */
  const [apiBaseInput, setApiBaseInput] = useState(() => localStorage.getItem('cuckoo_api_base') ?? '');
  /** APK 下载入口信息（APK 内已安装 → 隐藏） */
  const [apk, setApk] = useState<AppApkInfo | null>(null);
  const isNative = Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

  useEffect(() => {
    authApi
      .getSettings()
      .then(setSettings)
      .catch((e) => setError(errorMessage(e)));
    void checkPushSubscribed().then((ok) => {
      setPushEnabled(ok);
      setPushSupport(isPushSupported());
    });
    if (!isNative) appApi.info().then(setApk).catch(() => setApk({ available: false }));
  }, [isNative]);

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

  /** #36（2026-09-10 深夜）：APK 导出时把照片以真实文件写入手机公共
   *  「Download/布谷照片/」（MediaStore，无需权限），绝对路径直接展示——
   *  用户此前找不到照片文件；Web 端不适用（照片仍内嵌报告） */
  const startPhotoExport = () => {
    void exportPhotosToPhone()
      .then((r) => {
        if (!r) return;
        if (!r.dir) {
          setNotice('没有可导出的照片记录');
          return;
        }
        const extra = [
          r.skipped ? `已存在 ${r.skipped} 张` : '',
          r.failed ? `失败 ${r.failed} 张` : '',
        ]
          .filter(Boolean)
          .join('，');
        setNotice(`照片已导出到手机目录：${r.dir}（新增 ${r.saved} 张${extra ? `，${extra}` : ''}）`);
      })
      .catch(() => setNotice('照片导出到手机失败，请检查网络后重试'));
  };

  /** #25/#33：导出全量数据——登录态生成 24h /uploads 直链并**自动拉起浏览器下载**（2026-09-09 用户要求：
   * 不再复制链接+提示，直接打开；attachment 头让浏览器直接进下载）。游客/离线走本地打包 */
  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const fileName = `cuckoo-data-${new Date().toISOString().slice(0, 10)}.json`;
      if (!useLocal()) {
        try {
          const { url } = await usersApi.exportLink();
          const link = absoluteUrl(url);
          // APK + Web 统一 window.open——Capacitor WebView 对外域 target=_blank 默认
          // 走系统浏览器（@capacitor/app v8 已移除 launchUrl，勿再引用）
          window.open(link, '_blank', 'noopener');
          // #36：APK 同时把照片文件落到 Download/布谷照片/（绝对路径可在文件管理查看）
          startPhotoExport();
          return;
        } catch {
          // 离线/接口失败 → 落到本地打包（下方）
        }
      }
      const json = (() => {
        const bundle = useGuestStore.getState().exportBundle();
        return JSON.stringify({ ...bundle, exportedAt: new Date().toISOString() }, null, 2);
      })();
      const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
      if (cap?.isNativePlatform?.()) {
        // #36：游客模式下照片多为 data: URI，同样落到 Download/布谷照片/（非阻塞）
        startPhotoExport();
        // APK：优先系统分享面板（用户可另存到任意位置——Documents 属 app 专属目录，文件管理器看不到，是「导出找不到文件」的根因）
        try {
          const file = new File([json], fileName, { type: 'application/json' });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: '布谷数据导出' });
            setNotice('已调起系统分享：可选择「保存到本地」或直接发送给好友');
            return;
          }
        } catch (se) {
          // 用户取消分享（AbortError）→ 静默返回；其他错误走写盘回退
          if (se instanceof DOMException && se.name === 'AbortError') return;
        }
        // 回退：写应用缓存目录（USB 连接电脑可访问）
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        await Filesystem.writeFile({ path: fileName, data: json, directory: Directory.Cache, recursive: true });
        setNotice(`已导出到应用缓存目录（USB 连接电脑可访问）：${fileName}`);
      } else {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        setNotice('已开始下载数据文件');
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
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-bg px-4 py-3">
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
                  <RImg src={user.avatarUrl} alt="头像" className="h-full w-full object-cover" />
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

        {/* 主题（外观）——三选一即时生效 */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <h2 className="text-sm font-medium">主题外观</h2>
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {THEMES.map((t) => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id as ThemeId)}
                  aria-pressed={active}
                  className={`rounded-xl border-2 p-2.5 text-left transition-colors ${active ? 'border-primary-500 bg-primary-50' : 'border-ink-100'}`}
                >
                  <span className="flex gap-1">
                    {t.dots.map((c) => (
                      <span key={c} className="h-4 w-4 rounded-full border border-black/5" style={{ backgroundColor: c }} />
                    ))}
                  </span>
                  <span className={`mt-2 block text-xs font-semibold ${active ? 'text-primary-700' : 'text-ink-700'}`}>{t.name}</span>
                  <span className="mt-0.5 block text-[10px] leading-tight text-ink-400">{t.desc}</span>
                </button>
              );
            })}
          </div>
        </section>

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

        {/* #8（2026-09-09 晚）：国产 ROM 后台弹窗引导——FSI/精确闹钟就位后，
            「非 App 界面不弹」的残余根因几乎都是系统侧管控（ColorOS 一键清理=强制停止会
            取消全部闹钟；后台弹出界面/锁屏显示/自启动被拒会静默吞掉全屏意图） */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <p className="text-sm font-medium">后台提醒收不到？</p>
          <p className="mt-1 text-xs leading-5 text-ink-500">
            已申请系统级精确闹钟与全屏提醒权限，若后台/锁屏仍不弹，请在系统设置中放行：
            <br />
            ① 电池 → 允许后台运行（或「不优化」布谷）
            <br />
            ② 最近任务里下拉布谷 → 加锁，避免一键清理强制停止（强制停止会取消全部闹钟）
            <br />
            ③ 应用信息 → 通知 → 允许「横幅/锁屏/全屏显示」；权限管理允许「后台弹出界面 + 自启动」
          </p>
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

        {/* #26：语音助手——AI API 本地保密存储（key 不上传服务器） */}
        <section className="divide-y divide-ink-100 rounded-card bg-surface shadow-sm">
          <h2 className="px-4 py-3 text-sm font-medium">语音助手</h2>
          <SettingRow
            label="语音助手"
            desc="开启后今日页底部显示语音按钮，点按开始说话、再次点按结束后 AI 解析预案并确认执行（浏览器需 HTTPS/允许麦克风；APK 使用原生语音识别，首次使用需允许麦克风权限）"
            checked={ai.enabled}
            disabled={busy}
            onChange={(v) => {
              saveAiConfig({ ...ai, enabled: v });
              setAi({ ...ai, enabled: v });
              setNotice(v ? '语音助手已开启（可在今日页点按唤醒）' : '语音助手已关闭');
            }}
          />
          <div className="px-4 py-3">
            <p className="text-sm">底部按钮方式</p>
            <p className="mt-0.5 text-xs text-ink-500">
              「语音识别」=点按说话；「打字输入」=点按弹出键盘直接打字（识别不准或环境不支持语音时用这个）。
              两种方式都会先生成预案、确认后才执行；底部按钮右侧小图标也能随时切换。
            </p>
            <div className="mt-2 flex gap-2">
              {(
                [
                  { v: 'voice' as const, label: '🎤 点按说话' },
                  { v: 'type' as const, label: '⌨️ 点按打字' },
                ]
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  aria-pressed={inputMode === o.v}
                  onClick={() => {
                    saveInputMode(o.v);
                    setInputMode(o.v);
                    setNotice(o.v === 'type' ? '已改为打字输入：底部按钮点按弹出键盘' : '已改为语音识别：底部按钮点按说话');
                  }}
                  className={`rounded-btn px-3 py-2 text-xs font-medium ${
                    inputMode === o.v ? 'bg-primary-500 text-white' : 'bg-bg text-ink-600'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 py-3">
            <label className="text-xs text-ink-500">AI API 地址（OpenAI 兼容，如 https://api.openai.com/v1 ）</label>
            <input
              value={ai.baseUrl}
              onChange={(e) => {
                const v = { ...ai, baseUrl: e.target.value };
                setAi(v);
                saveAiConfig(v);
              }}
              placeholder="https://api.openai.com/v1"
              className="mt-1 w-full rounded-btn border border-ink-100 bg-bg px-3 py-2 text-sm outline-none focus:border-primary-400"
            />
            <label className="mt-2 block text-xs text-ink-500">API 密钥（仅保存在本机，不会上传服务器）</label>
            <input
              type="password"
              value={ai.apiKey}
              onChange={(e) => {
                const v = { ...ai, apiKey: e.target.value };
                setAi(v);
                saveAiConfig(v);
              }}
              placeholder="sk-…"
              className="mt-1 w-full rounded-btn border border-ink-100 bg-bg px-3 py-2 text-sm outline-none focus:border-primary-400"
            />
            <label className="mt-2 block text-xs text-ink-500">模型</label>
            <input
              value={ai.model}
              onChange={(e) => {
                const v = { ...ai, model: e.target.value };
                setAi(v);
                saveAiConfig(v);
              }}
              placeholder="gpt-4o-mini / deepseek-chat"
              className="mt-1 w-full rounded-btn border border-ink-100 bg-bg px-3 py-2 text-sm outline-none focus:border-primary-400"
            />
            <button
              disabled={!ai.apiKey || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const { runAssistant } = await import('../assistant/assistant');
                  const r = await runAssistant('你好，简单介绍你可以帮忙做什么设置');
                  // 2026-09-07（#9）：成功/失败都用屏幕正中弹窗展示（不再走顶部提示）
                  setAiTestResult(r.error ? `❌ 连接失败：${r.error}` : `✅ 连接成功\n\n${r.reply}`);
                } catch (e) {
                  setAiTestResult(`❌ 连接失败：${errorMessage(e)}`);
                } finally {
                  setBusy(false);
                }
              }}
              className="mt-3 rounded-btn bg-primary-50 px-4 py-2 text-xs font-medium text-primary-600 disabled:opacity-50"
            >
              测试连接
            </button>
          </div>
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
              <p className="mt-0.5 text-xs text-ink-500">
                生成单文件报告（含照片，离线可看）· 报告存到系统下载目录；照片另存到手机「Download/布谷照片」文件夹（绝对路径，文件管理可直接查看）
              </p>
            </div>
          </button>
          {/* #22/#26：合并游客数据——预览+确认合并；可单独清空游客数据 */}
          <div className="w-full px-4 py-3.5">
            <div className="flex items-center gap-3">
              <Database size={18} className="shrink-0 text-primary-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">合并游客数据</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  预览后确认合并到当前账户（重复内容按更新时间较新保留）；游客数据默认不会自动同步
                </p>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  if (guestActive || !hasGuestData) return;
                  // #26：预览内容（计数与部分提醒标题）
                  try {
                    const raw = localStorage.getItem('cuckoo_local:guest');
                    const g = raw ? JSON.parse(raw) : null;
                    const rl = (g?.reminders ?? []) as { title?: string }[];
                    const lines = [
                      `提醒 ${rl.length} 条 · 日志 ${(g?.logs ?? []).length} 条 · 药品 ${(g?.medicines ?? []).length} 种 · 计划 ${(g?.plans ?? []).length} 个`,
                    ];
                    if (rl.length) {
                      lines.push('提醒示例：' + rl.slice(0, 3).map((x) => `「${x.title ?? ''}」`).join('、') + (rl.length > 3 ? ` 等 ${rl.length} 条` : ''));
                    }
                    lines.push('与账户重复的内容按更新时间较新保留；合并后游客数据将被清除。');
                    setPreviewMerge(lines.join('\n'));
                  } catch {
                    setError('游客数据无法读取，请重试');
                  }
                }}
                disabled={guestActive || !hasGuestData}
                className="flex-1 rounded-btn bg-primary-500 py-2.5 text-xs font-medium text-white disabled:opacity-40"
              >
                预览并合并
              </button>
              <button
                onClick={() => setConfirmClearGuest(true)}
                disabled={guestActive || !hasGuestData}
                className="flex-1 rounded-btn bg-danger-500/10 py-2.5 text-xs font-medium text-danger-600 disabled:opacity-40"
              >
                清空游客数据
              </button>
            </div>
          </div>
        </section>

        {/* 亲友已迁移至：个人主页「亲友与家人」与社交页「亲友」tab */}
        {/* #26：高级——局域网服务器地址（APK 连接 PC 开发服务器调试用，仅存本机） */}
        <section className="divide-y divide-ink-100 rounded-card bg-surface shadow-sm">
          <h2 className="px-4 py-3 text-sm font-medium">高级</h2>
          <div className="px-4 py-3">
            <p className="text-xs text-ink-500">服务器地址（留空=默认；APK 连接电脑局域网：http://电脑IP:3000）</p>
            <div className="mt-1 flex gap-2">
              <input
                value={apiBaseInput}
                onChange={(e) => setApiBaseInput(e.target.value)}
                placeholder="http://192.168.1.5:3000"
                className="min-w-0 flex-1 rounded-btn border border-ink-100 bg-bg px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
              <button
                onClick={() => {
                  localStorage.setItem('cuckoo_api_base', apiBaseInput.trim());
                  refreshApiBase();
                  setNotice(apiBaseInput.trim() ? `已切换服务器：${apiBaseInput.trim()}` : '已恢复默认服务器地址');
                }}
                className="shrink-0 rounded-btn bg-primary-500 px-4 py-2 text-xs font-medium text-white"
              >
                保存
              </button>
            </div>
          </div>
        </section>

        {/* 下载 App——网页端提供最新 APK 安装包（APK 内已安装 → 隐藏） */}
        {!isNative && apk?.available && (
          <section className="divide-y divide-ink-100 rounded-card bg-surface shadow-sm">
            <a href={appApi.downloadUrl()} download="cuckoo-app.apk" className="flex w-full items-center gap-3 px-4 py-3.5">
              <Download size={18} className="shrink-0 text-primary-600" />
              <div className="min-w-0">
                <p className="text-sm font-medium">下载 App（Android）</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  最新安装包
                  {apk.sizeBytes != null && ` · ${(apk.sizeBytes / 1024 / 1024).toFixed(1)} MB`}
                  {apk.updatedAt && ` · 构建于 ${apk.updatedAt.slice(0, 10)}`}
                </p>
              </div>
              <span className="ml-auto shrink-0 rounded-full bg-primary-500/10 px-2.5 py-1 text-[11px] font-medium text-primary-700">
                下载
              </span>
            </a>
          </section>
        )}

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
              {!online && <span className="ml-auto text-[10px] text-ink-400">离线账户：联网后即可注销（账号数据在云端）</span>}
            </button>
          )}
        </section>

        <p className="flex items-center justify-center gap-1 pt-2 text-xs text-ink-500">
          <Bell size={12} /> 布谷 Cuckoo v0.2 · 准时提醒，温柔守护
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

      {/* AI 测试连接结果（居中弹窗） */}
      {aiTestResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8" onClick={() => setAiTestResult(null)}>
          <div
            className="w-full max-w-sm rounded-card bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">AI 连接测试</h3>
            <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-btn bg-bg px-3.5 py-3 text-sm leading-relaxed text-ink-700">
              {aiTestResult}
            </p>
            <button
              onClick={() => setAiTestResult(null)}
              className="mt-4 w-full rounded-btn bg-primary-500 py-2.5 text-sm font-medium text-white"
            >
              知道了
            </button>
          </div>
        </div>
      )}

      {/* #26：合并游客数据——预览确认 */}
      <ConfirmModal
        open={previewMerge !== null}
        title="确认合并游客数据？"
        message={previewMerge ?? ''}
        confirmText="确认合并"
        cancelText="取消"
        onCancel={() => setPreviewMerge(null)}
        onConfirm={async () => {
          try {
            const r = useGuestStore.getState().mergeGuestData();
            setHasGuestData(localStorage.getItem('cuckoo_local:guest') !== null);
            setPreviewMerge(null);
            setError(null);
            setNotice(
              r.merged > 0
                ? `已合并 ${r.merged} 条游客数据到当前账户${r.skipped > 0 ? `，${r.skipped} 条重复按更新时间保留了较新版本` : ''}`
                : '暂无游客数据可合并（或已合并过）',
            );
          } catch (e) {
            setError(errorMessage(e));
            setPreviewMerge(null);
          }
        }}
      />
      {/* #26：清空游客数据（不合并） */}
      <ConfirmModal
        open={confirmClearGuest}
        title="确认清空游客数据？"
        message="将删除本机游客模式的全部数据（提醒/记录/计划/设置），且无法恢复；如需保留请先「预览并合并」到当前账户。"
        confirmText="确认清空"
        cancelText="取消"
        onCancel={() => setConfirmClearGuest(false)}
        onConfirm={() => {
          useGuestStore.getState().clearGuestData();
          setHasGuestData(false);
          setConfirmClearGuest(false);
          setNotice('游客数据已清空');
        }}
      />

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
