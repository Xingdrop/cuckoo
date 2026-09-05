import { Award, BarChart3, Bell, BellRing, ChevronLeft, Database, Download, LogOut, Shield, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { ConfirmModal } from '../components/ConfirmModal';
import { ReminderOverlay } from '../features/reminders/ReminderOverlay';
import { authApi } from '../services/api/api.auth';
import { usersApi } from '../services/api/api.users';
import { loadAiConfig, saveAiConfig } from '../assistant/assistant';
import { refreshApiBase } from '../services/http';
import { errorMessage } from '../services/http';
import { useAuthStore } from '../stores/authStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useGuestStore } from '../guest/guestStore';
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
  const [hasGuestData, setHasGuestData] = useState(() => localStorage.getItem('cuckoo_local:guest') !== null);
  /** #26：合并预览弹窗（确认后合并）/ 清空游客数据确认 */
  const [previewMerge, setPreviewMerge] = useState<string | null>(null);
  const [confirmClearGuest, setConfirmClearGuest] = useState(false);
  /** #26：AI 助手配置（本地保密存储） */
  const [ai, setAi] = useState(() => loadAiConfig());
  /** #26：服务器地址输入 */
  const [apiBaseInput, setApiBaseInput] = useState(() => localStorage.getItem('cuckoo_api_base') ?? '');

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

  /** #25：导出全量数据——离线/游客本地打包；APK 用原生文件系统写盘（WebView 下载受限） */
  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const json = useLocal()
        ? (() => {
            const bundle = useGuestStore.getState().exportBundle();
            return JSON.stringify({ ...bundle, exportedAt: new Date().toISOString() }, null, 2);
          })()
        : await usersApi.exportData();
      const fileName = `cuckoo-data-${new Date().toISOString().slice(0, 10)}.json`;
      const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
      if (cap?.isNativePlatform?.()) {
        // APK：写入「文档」目录；失败回退「缓存」目录（文件系统权限受限场景）
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        let dir = Directory.Documents;
        try {
          await Filesystem.writeFile({ path: fileName, data: json, directory: dir, recursive: true });
        } catch {
          dir = Directory.Cache;
          await Filesystem.writeFile({ path: fileName, data: json, directory: dir, recursive: true });
        }
        setNotice(
          dir === Directory.Documents
            ? `已导出到本机「文档」目录：${fileName}`
            : `已导出到应用缓存目录（离线保存）：${fileName}`,
        );
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

        {/* #26：语音助手——AI API 本地保密存储（key 不上传服务器） */}
        <section className="divide-y divide-ink-100 rounded-card bg-surface shadow-sm">
          <h2 className="px-4 py-3 text-sm font-medium">语音助手</h2>
          <SettingRow
            label="语音助手"
            desc="开启后今日页左下角显示麦克风；长按页面任意处，上滑把圆圈拖入麦克风即可语音控制（浏览器需 HTTPS/允许麦克风）"
            checked={ai.enabled}
            disabled={busy}
            onChange={(v) => {
              saveAiConfig({ ...ai, enabled: v });
              setAi({ ...ai, enabled: v });
              setNotice(v ? '语音助手已开启（可在今日页长按唤醒）' : '语音助手已关闭');
            }}
          />
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
                setError(null);
                try {
                  const { runAssistant } = await import('../assistant/assistant');
                  const r = await runAssistant('你好，简单介绍你可以帮忙做什么设置');
                  setNotice(r.error || r.reply);
                } catch (e) {
                  setError(errorMessage(e));
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
              <p className="mt-0.5 text-xs text-ink-500">下载 JSON（提醒/日志/药品/计划/设置全量；离线也可用）</p>
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

        {/* 亲友（绑定/摘要/聊天/联系人）——在线账户功能 */}
        <section className="divide-y divide-ink-100 rounded-card bg-surface shadow-sm">
          <h2 className="px-4 py-3 text-sm font-medium">亲友</h2>
          <button
            onClick={() => navigate('/family')}
            disabled={!online}
            title={!online ? '该功能需联网' : undefined}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-40"
          >
            <Users size={18} className="shrink-0 text-primary-600" />
            <div>
              <p className="text-sm font-medium">亲友与家人</p>
              <p className="mt-0.5 text-xs text-ink-500">
                邀请码绑定亲友 · 查看彼此完成情况与照片 · 简易聊天 · 漏服/库存通知联系人
              </p>
            </div>
            {!online && <span className="ml-auto text-[10px] text-ink-400">需联网</span>}
          </button>
        </section>

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
