/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8c3JjL3BhZ2VzL0d1ZXN0UGFnZS50c3h8MjAyNi0wOXxmNmVlNzEyZGUy */
import { ChevronLeft, CloudUpload, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGuestStore } from '../guest/guestStore';
import { authApi } from '../services/api/api.auth';
import { usersApi } from '../services/api/api.users';
import { tokenStore } from '../services/http';
import { useAuthStore } from '../stores/authStore';

// 兼容别名：App 路由 lazy 引用名为 GuestPage
export { GuestHomePage as GuestPage };

type Tab = 'today' | 'reminders' | 'stats';

/**
 * 游客主页（#3：仅锁定账户与社交；今日/提醒/统计照常，数据存本机）。
 * /guest、以及游客访问 /today /reminders /stats 时复用。
 */
export function GuestHomePage({ initial = 'today' }: { initial?: Tab }) {
  const navigate = useNavigate();
  const guest = useGuestStore();
  const setUser = useAuthStore((s) => s.setUser);
  const [tab, setTab] = useState<Tab>(initial);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('09:00');
  const [mode, setMode] = useState<'browse' | 'login' | 'register'>('browse');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [done, setDone] = useState(false);

  const water = guest.todayWater();
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayLogs = guest.logs.filter((l) => l.scheduledTime.slice(0, 10) === todayKey);

  const syncToCloud = async () => {
    if (!username || !password) return;
    setError(null);
    setSyncing(true);
    try {
      let token = tokenStore.get();
      let userId: string | null = null;
      if (!token) {
        const res =
          mode === 'register'
            ? await authApi.register({ username, password })
            : await authApi.login({ username, password });
        tokenStore.set(res.token);
        setUser(res.user);
        userId = res.user.id;
        token = res.token;
      }
      if (!token) throw new Error('未获得登录凭证');
      await usersApi.importData(guest.exportBundle());
      guest.clear();
      // #17：升级后切换为在线账户上下文并预拉全量镜像（断网可用）
      useGuestStore.getState().loginAccount(userId ?? useAuthStore.getState().user?.id ?? 'online', 'online');
      void import('../guest/mirror').then((m) => m.refreshLocalCache());
      setDone(true);
      // #2：升级后进入今日界面（退出游客其它界面状态）
      setTimeout(() => navigate('/today'), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : '合并失败，请重试');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="mx-auto max-w-md pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-bg px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center text-ink-700"
          aria-label="返回"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="flex-1 text-lg font-semibold">游客模式</h1>
        <button
          onClick={() => setTab(initial)}
          className="flex h-9 items-center gap-1 rounded-full bg-primary-500 px-3 text-xs font-medium text-white"
        >
          <CloudUpload size={13} /> 升级
        </button>
      </header>

      <main className="px-4 pt-3">
        {/* 提示条（#2/#17：数据本机 + 升级入口） */}
        <p className="mb-3 rounded-btn bg-accent-100/60 px-3 py-2 text-[11px] text-accent-700">
          🎒 游客模式：数据仅保存在本机。今日 / 提醒 / 统计、服务与管理、我的计划均可使用；社交（点赞 / 发帖 / 评论）需登录；注册后自动同步升级
        </p>

        {/* tab：今日 / 提醒 / 统计 */}
        <div className="mb-3 flex gap-1 rounded-full bg-ink-100/60 p-1">
          {(['today', 'reminders', 'stats'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full py-1.5 text-xs font-medium ${
                tab === t ? 'bg-surface text-ink-700 shadow-sm' : 'text-ink-500'
              }`}
            >
              {t === 'today' ? '今日' : t === 'reminders' ? `提醒（${guest.reminders.length}）` : '统计'}
            </button>
          ))}
        </div>

        {tab === 'today' && (
          <div className="space-y-3">
            <section className="rounded-card bg-surface p-4 shadow-sm">
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
            <section className="rounded-card bg-surface p-4 shadow-sm">
              <p className="text-sm font-medium">今日打卡（{todayLogs.length}）</p>
              <ul className="mt-2 space-y-1.5">
                {todayLogs.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 text-xs">
                    <span>{l.amount > 0 ? '💧' : '✅'}</span>
                    <span className="flex-1 truncate">
                      {l.reminderId
                        ? guest.reminders.find((r) => r.id === l.reminderId)?.title ?? '已打卡事项'
                        : `喝水 +${l.amount}ml`}
                    </span>
                    <span className="text-ink-300">
                      {l.status === 'completed' ? '已完成' : '已跳过'}
                    </span>
                  </li>
                ))}
                {todayLogs.length === 0 && (
                  <li className="py-2 text-center text-xs text-ink-300">今天还没有打卡记录</li>
                )}
              </ul>
            </section>
          </div>
        )}

        {tab === 'reminders' && (
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
                    <button onClick={() => guest.removeReminder(r.id)} className="shrink-0 text-ink-300" aria-label="删除">
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
        )}

        {tab === 'stats' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-card bg-surface p-4 text-center shadow-sm">
              <p className="text-xl font-bold text-primary-600">{water}</p>
              <p className="mt-0.5 text-[11px] text-ink-500">今日饮水 ml</p>
            </div>
            <div className="rounded-card bg-surface p-4 text-center shadow-sm">
              <p className="text-xl font-bold text-primary-600">{guest.logs.filter((l) => l.scheduledTime.slice(0, 10) === todayKey).length}</p>
              <p className="mt-0.5 text-[11px] text-ink-500">今日打卡</p>
            </div>
          </div>
        )}

        {/* 升级并同步（游客→云端合并） */}
        <section className="mt-3 rounded-card bg-surface p-4 shadow-sm">
          <p className="text-sm font-medium">升级并同步到云端</p>
          {done ? (
            <p className="mt-2 rounded-btn bg-primary-50 px-3 py-2 text-sm text-primary-700">
              ✅ 已合并！正在进入正式版…
            </p>
          ) : mode === 'browse' ? (
            <>
              <p className="mt-1 text-xs text-ink-500">注册或登录后，本机数据将合并到云端账户（同类数据按更新时间较新优先）。</p>
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
                placeholder="用户名"
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
