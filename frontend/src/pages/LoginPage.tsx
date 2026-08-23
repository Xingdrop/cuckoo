import { FormEvent, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../services/http';
import { useAuthStore } from '../stores/authStore';
import { loginSchema, registerSchema } from '../types/schemas';

/**
 * P-02 登录/注册（FR-101/102）
 * 登录成功 → 跳转 redirect 参数或 /today
 */
export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, login, register } = useAuthStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  if (user) return <Navigate to="/today" replace />;
  const redirect = params.get('redirect') ?? '/today';

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
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-500 text-3xl">
          🐦
        </div>
        <h1 className="mt-4 text-2xl font-bold">布谷</h1>
        <p className="mt-2 text-sm text-ink-500">准时提醒，温柔守护</p>
      </div>

      <div className="mt-8 rounded-card bg-surface p-6 shadow-sm">
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
      </div>
    </div>
  );
}
