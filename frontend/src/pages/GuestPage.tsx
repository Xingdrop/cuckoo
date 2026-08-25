import { ChevronLeft, CloudUpload, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGuestStore } from '../guest/guestStore';
import { authApi } from '../services/api/api.auth';
import { usersApi } from '../services/api/api.users';
import { tokenStore } from '../services/http';
import { useAuthStore } from '../stores/authStore';

/**
 * 游客模式（#2/#3）：数据仅存本机；可本地新建提醒/打卡/记水；
 * 「升级并同步」→ 登录/注册 → 上传本地数据（云端按 created_at 较新合并）。
 */
export function GuestPage() {
  const navigate = useNavigate();
  const guest = useGuestStore();
  const setUser = useAuthStore((s) => s.setUser);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('09:00');
  const [mode, setMode] = useState<'browse' | 'login' | 'register'>('browse');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [done, setDone] = useState(false);

  const water = guest.todayWater();
  const todayLogs = guest.logs.filter((l) => l.scheduledTime.slice(0, 10) === new Date().toISOString().slice(0, 10));

  const syncToCloud = async () => {
    if (!username || !password) return;
    setError(null);
    setSyncing(true);
    try {
      let token = tokenStore.get();
      if (!token) {
        const res =
          mode === 'register'
            ? await authApi.register({ username, password })
            : await authApi.login({ username, password });
        tokenStore.set(res.token);
        setUser(res.user);
        token = res.token;
      }
      if (!token) throw new Error('未获得登录凭证');
      const result = await usersApi.importData(guest.exportBundle());
      guest.clear();
      setDone(true);
      setTimeout(() => navigate('/reminders'), 1200);
      console.log('import result:', result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '合并失败，请重试');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="mx-auto max-w-md pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-bg/95 px-4 py-3 backdrop-blur">
        <button
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center text-ink-700"
          aria-label="返回"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="flex-1 text-lg font-semibold">游客体验</h1>
      </header>

      <main className="px-4 pt-3">
        <p className="mb-3 rounded-btn bg-accent-100/60 px-3 py-2 text-[11px] text-accent-700">
          🔒 游客模式下所有数据仅保存在本机浏览器（localStorage），不会上传；可随时「升级并同步」到云端账户
        </p>

        {/* 今日喝水 */}
        <section className="mb-3 rounded-card bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-500">💧 今日喝水（本地）</p>
            <button
              onClick={() => guest.recordWater(200)}
              className="rounded-full bg-primary-500 px-3 py-1 text-[11px] font-medium text-white"
            >
              +200
            </button>
          </div>
          <p className="mt-1 text-2xl font-bold text-primary-600">{water}ml</p>
        </section>

        {/* 本地提醒 */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <p className="text-sm font-medium">本地提醒（{guest.reminders.length}）</p>
          <div className="mt-2 flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && title.trim()) {
                  guest.saveReminder({ title: title.trim(), category: 'custom', times: [time], startDate: new Date().toISOString().slice(0, 10), isActive: true });
                  setTitle('');
                }
              }}
              maxLength={30}
              placeholder="提醒内容，如：喝水"
              className="min-w-0 flex-1 rounded-btn border border-ink-100 bg-bg px-3 py-2 text-xs outline-none focus:border-primary-400"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-btn border border-ink-100 bg-bg px-2 py-2 text-xs"
            />
            <button
              onClick={() => {
                if (title.trim()) {
                  guest.saveReminder({ title: title.trim(), category: 'custom', times: [time], startDate: new Date().toISOString().slice(0, 10), isActive: true });
                  setTitle('');
                }
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-primary-500 text-white"
              aria-label="添加"
            >
              <Plus size={16} />
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {guest.reminders.map((r) => {
              const done = todayLogs.some((l) => l.reminderId === r.id && l.status === 'completed');
              const skipped = todayLogs.some((l) => l.reminderId === r.id && l.status === 'skipped');
              return (
                <li key={r.id} className="flex items-center gap-2 rounded-btn bg-bg px-3 py-2.5">
                  <span className="text-lg">{done ? '✅' : skipped ? '⭕' : '📌'}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${done || skipped ? 'text-ink-400 line-through' : ''}`}>{r.title}</p>
                    <p className="text-[10px] text-ink-400">{r.times.join('/')} · 每天</p>
                  </div>
                  {!done && !skipped && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => guest.ack(r.id, 'completed')}
                        className="rounded-full bg-primary-500 px-2 py-0.5 text-[10px] text-white"
                      >
                        完成
                      </button>
                      <button
                        onClick={() => guest.ack(r.id, 'skipped')}
                        className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] text-ink-600"
                      >
                        跳过
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => guest.removeReminder(r.id)}
                    className="shrink-0 text-ink-300"
                    aria-label="删除"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
            {guest.reminders.length === 0 && (
              <p className="py-3 text-center text-xs text-ink-300">还没有本地提醒，添加一条试试</p>
            )}
          </ul>
        </section>

        {/* 升级并同步 */}
        <section className="mt-3 rounded-card bg-surface p-4 shadow-sm">
          <p className="text-sm font-medium">升级并同步到云端</p>
          {done ? (
            <p className="mt-2 rounded-btn bg-primary-50 px-3 py-2 text-sm text-primary-700">
              ✅ 已合并！本地数据已上传（云端按更新时间较新保留），正在进入正式版…
            </p>
          ) : mode === 'browse' ? (
            <>
              <p className="mt-1 text-xs text-ink-500">注册或登录后，把本机数据合并到云端账户（同类数据按 created_at 较新优先）。</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setMode('register')}
                  className="flex-1 rounded-btn bg-primary-500 py-2.5 text-sm font-medium text-white"
                >
                  注册并同步
                </button>
                <button
                  onClick={() => setMode('login')}
                  className="flex-1 rounded-btn bg-ink-100 py-2.5 text-sm font-medium text-ink-700"
                >
                  登录并同步
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={30}
                placeholder="用户名（3~30 位）"
                className="mt-2 w-full rounded-btn border border-ink-100 bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary-400"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={64}
                placeholder="密码（≥8 位）"
                className="mt-2 w-full rounded-btn border border-ink-100 bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary-400"
              />
              {error && <p className="mt-2 text-xs text-danger-600">{error}</p>}
              <button
                onClick={() => void syncToCloud()}
                disabled={syncing || !username || password.length < 8}
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-btn bg-primary-500 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                <CloudUpload size={15} /> {syncing ? '同步中…' : `确认${mode === 'register' ? '注册' : '登录'}并合并`}
              </button>
              <button onClick={() => setMode('browse')} className="mt-2 w-full py-1 text-xs text-ink-400">
                返回
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
