/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3BhZ2VzL0xvZ2luUGFnZS50c3h8MjAyNi0wOXxiNjgyOWM2MjVh */
import { FormEvent, useState } from 'react';
import { ChevronRight, WifiOff } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage, refreshApiBase, tokenStore } from '../services/http';
import { Capacitor } from '@capacitor/core';
import { DEFAULT_NATIVE_API_BASE } from '../config/defaultApiBase';
import { useAuthStore } from '../stores/authStore';
import { useGuestStore } from '../guest/guestStore';
import { useConnectionStore } from '../stores/connectionStore';
import { loginSchema, registerSchema } from '../types/schemas';

/**
 * P-02 登录/注册（FR-101/102）
 * 登录成功 → 跳转 /today；#17：未联网时支持「离线账户」本地密码校验（APK 预置）。
 */
export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** APK 首次使用：服务器地址未配置时在登录页直接填写（否则所有请求打到 WebView 本地源） */
  const isNative = Capacitor.isNativePlatform();
  const [apiBaseInput, setApiBaseInput] = useState(() => localStorage.getItem('cuckoo_api_base') ?? '');
  const hasDefault = Boolean(DEFAULT_NATIVE_API_BASE);
  const needServerSetup = isNative && !apiBaseInput.trim() && !hasDefault;
  const { user, login, register } = useAuthStore();
  const online = useConnectionStore((s) => s.online);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  void params; // redirect 已废弃：登录后统一进入 /today（#2）

  // 仅当会话有效（token 存在）时才跳过登录页；#17：种子账户不再自动登录
  if (user && tokenStore.get()) {
    return <Navigate to="/today" replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    // zod 校验（与后端 DTO 语义对齐，types/schemas.ts）
    const parsed =
      mode === 'register'
        ? registerSchema.safeParse({ username, password, confirm })
        : loginSchema.safeParse({ username, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入有误');
      return;
    }
    // online 初始为 false、探测异步进行——先等探测出结果再拦（防冷启动注册被误判离线）
    if (mode === 'register' && !(await useConnectionStore.getState().ensureChecked())) {
      setError('注册需要联网；当前可登录预置离线账户（本地校验）');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
      // #2：登录成功后统一进入今日界面（退出所有其它界面状态）
      navigate('/today', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="text-center">
        <img
          src="/icons/icon-192.png"
          alt="布谷"
          className="mx-auto h-16 w-16 rounded-2xl shadow-md"
        />
        <h1 className="mt-4 text-2xl font-bold">布谷</h1>
        <p className="mt-2 text-sm text-ink-500">准时提醒，温柔守护</p>
      </div>

      {/* #17：未联网提示（APK 无服务器时默认出现） */}
      {!online && (
        <div className="mt-6 flex items-center gap-2 rounded-btn bg-warning-500/15 px-3.5 py-2.5 text-xs text-ink-700">
          <WifiOff size={14} className="shrink-0 text-warning-500" />
          <span>
            当前未联网——可使用预置离线账户（本地密码校验）在完全离线下使用今日 / 提醒 / 统计 / 管理功能；联网后数据自动同步。
          </span>
        </div>
      )}

      <div className="mt-6 rounded-card bg-surface p-6 shadow-sm">
        {/* 模式切换 */}
        <div className="flex rounded-btn bg-bg p-1">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === m ? 'bg-primary-500 text-white' : 'text-ink-500'
              }`}
            >
              {m === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="username" className="text-sm text-ink-700">
              用户名
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              maxLength={24}
              placeholder="2-24 位，支持中文/字母/数字"
              className="mt-1 w-full rounded-btn border border-ink-100 px-3 py-2.5 text-sm outline-none focus:border-primary-400"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm text-ink-700">
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : 1}
              maxLength={64}
              placeholder={mode === 'register' ? '至少 8 位' : '请输入密码'}
              className="mt-1 w-full rounded-btn border border-ink-100 px-3 py-2.5 text-sm outline-none focus:border-primary-400"
            />
          </div>
          {mode === 'register' && (
            <div>
              <label htmlFor="confirm" className="text-sm text-ink-700">
                确认密码
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="mt-1 w-full rounded-btn border border-ink-100 px-3 py-2.5 text-sm outline-none focus:border-primary-400"
              />
            </div>
          )}

          {isNative && (
        <div className={`mb-4 rounded-card border p-3.5 ${needServerSetup ? 'border-warning-500/60 bg-warning-500/10' : 'border-ink-100 bg-bg'}`}>
          <p className="text-xs font-medium text-ink-700">服务器地址 {needServerSetup ? '（首次使用必填）' : ''}</p>
          <div className="mt-2 flex gap-2">
            <input
              value={apiBaseInput}
              onChange={(e) => setApiBaseInput(e.target.value)}
              placeholder={DEFAULT_NATIVE_API_BASE || "http://电脑IP:3000"}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              className="min-w-0 flex-1 rounded-btn border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-500"
            />
            <button
              type="button"
              onClick={() => {
                localStorage.setItem('cuckoo_api_base', apiBaseInput.trim());
                refreshApiBase();
                setError(null);
              }}
              className="shrink-0 rounded-btn bg-primary-500 px-4 py-2 text-xs font-medium text-white"
            >
              保存
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
            {hasDefault
              ? '已内置默认服务器地址（与开发者电脑同一 WiFi 时自动可用）；如有改动可在此覆盖'
              : '与电脑同一 WiFi：填写电脑后端地址后即可登录/注册；游客模式与离线账户无需联网'}
          </p>
        </div>
      )}
      {error && (
            <p className="rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-btn bg-primary-500 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
          >
            {submitting ? '请稍候…' : mode === 'login' ? '登录' : '注册并开始'}
          </button>
        </form>

        {/* 游客入口（#2：显著的次级入口） */}
        <div className="mt-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-ink-100" />
          <span className="text-xs text-ink-300">或</span>
          <span className="h-px flex-1 bg-ink-100" />
        </div>
        <button
          onClick={() => {
            // #21：游客 = 本地账户——直接进入与离线账户一模一样的 /today 界面
            useGuestStore.getState().activate();
            void import('../guest/seed').then((m) => m.seedGuestSocialCache());
            navigate('/today', { replace: true });
          }}
          className="mt-4 flex w-full items-center gap-3 rounded-card border border-primary-100 bg-primary-50/50 px-4 py-3.5 text-left transition-colors hover:bg-primary-50"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-lg shadow-sm">
            🎒
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink-700">先以游客身份体验</span>
            <span className="block text-[11px] text-ink-500">本地账户 · 所有本地功能可用 · 数据仅存本机</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-ink-300" />
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-ink-300">
        <Link to="/privacy" className="underline-offset-2 hover:underline">
          隐私政策与健康免责声明
        </Link>
        <span className="mx-2 text-ink-200">·</span>
        <Link to="/privacy" className="underline-offset-2 hover:underline">
          隐私政策
        </Link>
      </p>
    </div>
  );
}
