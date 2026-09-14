/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3BhZ2VzL1BvbW9kb3JvUGFnZS50c3h8MjAyNi0wOXxhNDY1ZDQ4MzZj */ */
import { ChevronLeft, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * P-番茄钟（FR-503）：工作 25min + 休息 5min 自动循环，可自定义
 */
export function PomodoroPage() {
  const navigate = useNavigate();
  const [workMin, setWorkMin] = useState(25);
  const [restMin, setRestMin] = useState(5);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [phase, setPhase] = useState<'work' | 'rest'>('work');
  const [running, setRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = (phase === 'work' ? workMin : restMin) * 60;
  const progress = total > 0 ? ((total - secondsLeft) / total) * 100 : 0;

  useEffect(() => {
    if (!running) return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          // 自动切换阶段
          if (phase === 'work') {
            setPhase('rest');
            return restMin * 60;
          }
          setPhase('work');
          return workMin * 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running, phase, workMin, restMin]);

  const reset = () => {
    setRunning(false);
    setPhase('work');
    setSecondsLeft(workMin * 60);
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

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
        <h1 className="flex-1 text-lg font-semibold">番茄钟</h1>
      </header>

      <main className="flex flex-col items-center px-4 pt-6">
        {/* 阶段切换 */}
        <div className="flex rounded-full bg-surface p-1 shadow-sm">
          {(['work', 'rest'] as const).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPhase(p);
                setSecondsLeft((p === 'work' ? workMin : restMin) * 60);
                setRunning(false);
              }}
              className={`rounded-full px-5 py-2 text-sm transition-colors ${
                phase === p ? (p === 'work' ? 'bg-primary-500 text-white' : 'bg-accent-500 text-white') : 'text-ink-700'
              }`}
            >
              {p === 'work' ? '🍅 专注' : '☕ 休息'}
            </button>
          ))}
        </div>

        {/* 计时圆环 */}
        <div className="relative mt-8 flex h-64 w-64 items-center justify-center">
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 256 256">
            <circle cx="128" cy="128" r="116" fill="none" stroke="#e2eae7" strokeWidth="10" />
            <circle
              cx="128"
              cy="128"
              r="116"
              fill="none"
              stroke={phase === 'work' ? '#3e8e7e' : '#f2a65a'}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 116}
              strokeDashoffset={2 * Math.PI * 116 * (1 - progress / 100)}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="text-center">
            <p className="text-5xl font-bold tabular-nums">{fmt(secondsLeft)}</p>
            <p className="mt-2 text-sm text-ink-500">
              {phase === 'work' ? '专注工作中' : '休息一下'}
            </p>
          </div>
        </div>

        {/* 控制 */}
        <div className="mt-8 flex items-center gap-4">
          <button
            onClick={() => setRunning((r) => !r)}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg transition-transform active:scale-95"
            aria-label={running ? '暂停' : '开始'}
          >
            {running ? <Pause size={26} /> : <Play size={26} className="ml-1" />}
          </button>
          <button
            onClick={reset}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink-500 shadow-sm"
            aria-label="重置"
          >
            <RotateCcw size={20} />
          </button>
        </div>

        {/* 自定义时长 */}
        <div className="mt-8 flex items-center gap-3 rounded-card bg-surface px-4 py-3 shadow-sm">
          <label className="text-sm text-ink-700">专注</label>
          <input
            type="number"
            min={1}
            max={120}
            value={workMin}
            onChange={(e) => {
              const v = Math.max(1, Number(e.target.value) || 25);
              setWorkMin(v);
              if (phase === 'work') setSecondsLeft(v * 60);
            }}
            className="w-16 rounded-btn border border-ink-100 px-2 py-1.5 text-center text-sm outline-none"
          />
          <span className="text-sm text-ink-500">分钟</span>
          <span className="mx-1 h-4 w-px bg-ink-100" />
          <label className="text-sm text-ink-700">休息</label>
          <input
            type="number"
            min={1}
            max={60}
            value={restMin}
            onChange={(e) => {
              const v = Math.max(1, Number(e.target.value) || 5);
              setRestMin(v);
              if (phase === 'rest') setSecondsLeft(v * 60);
            }}
            className="w-16 rounded-btn border border-ink-100 px-2 py-1.5 text-center text-sm outline-none"
          />
          <span className="text-sm text-ink-500">分钟</span>
        </div>
        <p className="mt-3 px-1 text-[11px] leading-relaxed text-ink-400">
          经典番茄钟为「专注 25 分钟 + 休息 5 分钟」，适合大多数专注任务；深度工作可用 50+10，
          初次尝试可从 15+3 开始——按自己的注意力节奏调整即可，专注结束后会自动进入休息循环。
        </p>
      </main>
    </div>
  );
}
