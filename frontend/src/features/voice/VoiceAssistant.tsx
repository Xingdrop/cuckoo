/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL2ZlYXR1cmVzL3ZvaWNlL1ZvaWNlQXNzaXN0YW50LnRzeHwyMDI2LTA5fDIwZWY2MmQxZTc= */
import { Mic, MicOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { nativeSpeechAvailable, startDictation, type DictationHandle } from './speechAdapter';
import { loadAiConfig, runAssistant, executePending, type HistoryTurn } from '../../assistant/assistant';

/**
 * 语音助手入口：底部悬浮「点按说话」按钮。
 *
 * #36（2026-09-10 深夜）交互改版：放弃长按手势，改为**点按开始、再点按结束**——
 * 长按状态机（按下即录/document 级松手监听/就绪前松手竞态/短按误触判定）是
 * 多轮真机问题（中断/丢字/录不停）的根源，点按开关从结构上消除整类手势缺陷：
 * 1. 点击开始录音 → 再点击请求结束 → 结束后文本进 AI 解析（预案确认不变）；
 * 2. 显式四态 phase：idle/starting/recording/stopping——starting 期间点停
 *    （快速点按）由 .then 检测 stopping 后立即 stop；stopping 期间忽略点击，
 *    杜绝「停止中再点又开始」的乱序；
 * 3. 空识别结果明确提示（点按开始是有意图的，不再静默丢弃）。
 *
 * 识别：APK=自建 NativeSpeech 原生插件（常驻识别器+无缝续听）；浏览器=Web Speech API。
 */

interface PlanStep {
  say?: string;
  act?: string;
  result?: string;
}

interface Plan {
  text: string;
  reply: string;
  steps: PlanStep[];
  actions: { id: string; params: Record<string, unknown> }[];
  error?: string;
}

interface Outcome {
  steps: PlanStep[];
  reply: string;
  error?: string;
}

/** 录音会话状态机（#36 点按开关） */
type VoicePhase = 'idle' | 'starting' | 'recording' | 'stopping';

export function VoiceAssistant({ onToast }: { onToast: (msg: string) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [live, setLive] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const recRef = useRef<DictationHandle | null>(null);
  const phaseRef = useRef<VoicePhase>('idle');
  /** phase 镜像为 state：全屏动画层按阶段响应（starting/recording/stopping） */
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const goPhase = (p: VoicePhase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  /** 识别文字可编辑（2026-09-13）：预案面板里改文字 → 重新解析 → 新预案 */
  const [editText, setEditText] = useState('');
  /** 多轮对话历史（继续对话时随新语音一并发给 AI） */
  const historyRef = useRef<HistoryTurn[]>([]);

  useEffect(() => {
    setEnabled(loadAiConfig().enabled);
    // 支持检测：原生插件可用 **或** 浏览器有 Web Speech API 都算支持
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const webOk = !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
    // 探测失败（含插件代理异常）兜底回 Web 检测，避免 supported 卡在 false
    void nativeSpeechAvailable()
      .then((n) => setSupported(n || webOk))
      .catch(() => setSupported(webOk));
    return () => {
      // 卸载兜底：停录音
      goPhase('idle');
      const h = recRef.current;
      recRef.current = null;
      void h?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 识别结束（结果或错误）→ 回到 idle；幂等防 stop 重复回调 */
  const finish = (text: string | null, errMsg?: string) => {
    if (phaseRef.current === 'idle') return;
    goPhase('idle');
    setRecording(false);
    // onError 路径句柄兜底：识别器可能仍在会话中（watchdog 会静默重开麦克风），
    // 必须显式 stop 释放监听器；正常结束路径 recRef 已被 toggleRecord 置空，此处为 no-op
    const liveHandle = recRef.current;
    recRef.current = null;
    void liveHandle?.stop();
    if (errMsg) {
      onToast(errMsg);
      return;
    }
    const t = (text ?? '').trim();
    if (!t) {
      onToast('未识别到语音，请再试一次');
      return;
    }
    void makePlan(t);
  };

  /** #36 点按开关：开始录音 ⇄ 请求结束 */
  const toggleRecord = () => {
    if (!enabled) {
      onToast('语音助手未开启：设置 → 语音助手 可开启');
      return;
    }
    const phase = phaseRef.current;
    if (phase === 'idle') {
      if (busy) return;
      if (!supported) {
        onToast('当前环境不支持语音识别（浏览器需 HTTPS；APK 请更新到含语音插件的新版本）');
        return;
      }
      recRef.current = null;
      setLive('');
      // 关闭底层页面已打开的弹窗（确认框/详情浮窗）——录音期间点击会被动画层
      // 拦截（防穿透误触），若不先关掉会形成「录不了也停不了」的死锁
      window.dispatchEvent(new CustomEvent('cuckoo:close-modals'));
      goPhase('starting');
      setRecording(true); // 乐观进入录音态：UI 即刻反馈
      void startDictation({
        onPartial: (t) => setLive(t),
        onFinal: (t) => finish(t),
        onError: (msg) => finish(null, msg),
      }).then((h) => {
        if (phaseRef.current === 'stopping') {
          // 快速点停（识别就绪前已点结束）→ 就绪后立即停
          void h.stop();
        } else if (phaseRef.current === 'starting') {
          goPhase('recording');
          recRef.current = h;
        }
      });
      return;
    }
    if (phase === 'stopping') return; // 结束中：忽略点击，防乱序
    // starting/recording → 请求结束（starting 场景由上方 .then 检测后立即 stop）
    goPhase('stopping');
    const h = recRef.current;
    recRef.current = null;
    if (h) void h.stop();
  };

  /** 松手后：AI 解析预案（不执行） */
  const makePlan = async (text: string) => {
    setBusy(true);
    setLive(text);
    setEditText(text);
    const out = await runAssistant(text, { autoRun: false, history: historyRef.current.slice(-6) });
    historyRef.current.push(
      { role: 'user', content: text },
      {
        role: 'assistant',
        content: `${out.reply}（动作：${(out.pendingActions ?? []).map((a) => a.id).join('、') || '无'}）`,
      },
    );
    historyRef.current = historyRef.current.slice(-6);
    setBusy(false);
    setPlan({
      text,
      reply: out.reply,
      steps: out.steps,
      actions: (out as unknown as { pendingActions?: { id: string; params: Record<string, unknown> }[] }).pendingActions ?? [],
      error: out.error,
    });
    if (out.error) onToast('AI 处理未完成');
  };

  /** 识别有误 → 改文字后重新解析（生成新预案替换当前） */
  const reParse = async () => {
    const t = editText.trim();
    if (busy || !t || t === plan?.text) return;
    setPlan(null);
    await makePlan(t);
  };

  /** 确认执行预案 */
  const confirmPlan = async () => {
    if (!plan || busy) return;
    setBusy(true);
    const out = await executePending(plan.actions, plan.text);
    setBusy(false);
    setPlan(null);
    setOutcome(out);
    historyRef.current.push({
      role: 'assistant',
      content: `已执行：${out.steps
        .filter((st) => st.result)
        .map((st) => `${st.act}=${st.result}`)
        .join('；')}`,
    });
    historyRef.current = historyRef.current.slice(-6);
    onToast(out.error ? 'AI 执行未完成' : 'AI 已完成调整');
  };

  return (
    <>
      <button
        aria-label="语音助手（点按说话）"
        onClick={toggleRecord}
        onContextMenu={(e) => e.preventDefault()}
        style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
        className={`fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 select-none items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium shadow-md ${
          recording
            ? 'animate-pulse border-danger-500 bg-danger-500 text-white'
            : enabled
              ? 'border-ink-100 bg-surface/95 text-primary-700'
              : 'border-ink-100 bg-surface/70 text-ink-300'
        }`}
      >
        {recording ? <MicOff size={13} /> : <Mic size={13} />}
        {recording ? '点击结束' : enabled ? '点按说话' : '语音助手（未开启）'}
      </button>

      {/* 语音全流程全屏反馈：starting/recording/stopping/AI 解析 各阶段不同动画。
          pointer-events-none 不拦截点按——底部按钮仍是唯一停止控件 */}
      {(phase !== 'idle' || (busy && !plan && !outcome)) && (
        <div
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-5"
          style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.45) 100%)' }}
          role="status"
          aria-live="polite"
          onClick={() => {
            // 录音中点任意处=结束（绝不穿透到底层页面——否则误触下层按钮形成死锁）
            if (phase === 'recording') toggleRecord();
          }}
        >
          {phase === 'starting' && (
            <>
              <span className="relative flex h-24 w-24 items-center justify-center">
                <span className="voice-breathe absolute inset-0 rounded-full border-2 border-white/70" />
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-500 text-white shadow-xl">
                  <Mic size={26} />
                </span>
              </span>
              <p className="text-sm font-medium text-white drop-shadow">正在开启麦克风…</p>
            </>
          )}
          {phase === 'recording' && (
            <>
              <span className="relative flex h-28 w-28 items-center justify-center">
                <span className="voice-ring absolute inset-0 rounded-full border-2 border-danger-400/70" />
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-danger-500 text-white shadow-2xl">
                  <Mic size={30} />
                </span>
              </span>
              <span className="flex h-8 items-end gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="voice-bar w-1.5 rounded-full bg-danger-300/90" style={{ animationDelay: `${i * 0.12}s` }} />
                ))}
              </span>
              <p className="max-w-[82vw] px-6 text-center text-lg font-medium leading-snug text-white drop-shadow-md">
                {live || '请开始说话…'}
              </p>
              <p className="text-xs text-white/70">再次点按结束</p>
            </>
          )}
          {phase === 'stopping' && (
            <>
              <span className="flex h-16 items-center justify-center gap-2">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="voice-dot h-2.5 w-2.5 rounded-full bg-white/90" style={{ animationDelay: `${i * 0.18}s` }} />
                ))}
              </span>
              <p className="text-sm font-medium text-white drop-shadow">正在整理识别结果…</p>
            </>
          )}
          {phase === 'idle' && busy && !plan && !outcome && (
            <>
              <span className="flex h-16 items-center justify-center gap-2">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="voice-dot h-2.5 w-2.5 rounded-full bg-white/90" style={{ animationDelay: `${i * 0.18}s` }} />
                ))}
              </span>
              <p className="text-sm font-medium text-white drop-shadow">正在理解你的话…</p>
              <p className="max-w-[80vw] px-6 text-center text-xs text-white/70">{live}</p>
            </>
          )}
        </div>
      )}

      {/* 预案确认面板：识别内容 + 将要进行的调整 → 确认执行 */}
      {plan && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-card bg-surface p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">确认执行以下调整？</h3>
            <button onClick={() => setPlan(null)} aria-label="关闭" className="rounded-full bg-ink-100 p-1.5 text-ink-500">
              <X size={16} />
            </button>
          </div>
          <p className="mt-2 text-[11px] text-ink-400">🎤 识别结果（识别有误可直接改文字后重新解析）</p>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={2}
            maxLength={200}
            className="mt-1 w-full resize-none rounded-btn border border-ink-100 bg-bg px-3 py-2 text-sm text-ink-700 outline-none focus:border-primary-300"
          />
          {editText.trim() !== plan.text && (
            <button
              onClick={() => void reParse()}
              disabled={busy || !editText.trim()}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded-btn bg-primary-50 py-1.5 text-xs font-medium text-primary-700 disabled:opacity-40"
            >
              {busy ? '解析中…' : '↻ 按修改后的文字重新解析'}
            </button>
          )}
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
            {plan.steps
              .filter((s) => s.act)
              .map((s, i) => (
                <div key={i} className="rounded-btn bg-bg px-3 py-2 text-xs">
                  <p className="text-ink-700">
                    ⚙️ <span className="font-medium">将要：</span>
                    {s.act}
                  </p>
                  {s.result && (
                    <p className="mt-1 text-ink-400">{s.result}</p>
                  )}
                </div>
              ))}
            {plan.steps.filter((s) => s.act).length === 0 && (
              <p className="rounded-btn bg-bg px-3 py-2 text-xs text-ink-400">没有匹配到可执行的调整（仅说明）</p>
            )}
          </div>
          {plan.reply && <p className="mt-3 text-sm font-medium text-ink-800">{plan.reply}</p>}
          {plan.error && <p className="mt-1 text-[11px] text-danger-600">{plan.error}</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={() => setPlan(null)} className="flex-1 rounded-btn bg-ink-100 py-2.5 text-sm font-medium text-ink-700">
              取消
            </button>
            <button
              onClick={() => void confirmPlan()}
              disabled={busy || plan.actions.length === 0}
              className="flex-1 rounded-btn bg-primary-500 py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? '执行中…' : `确认执行${plan.actions.length ? `（${plan.actions.length} 项）` : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* 执行结果面板 */}
      {outcome && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-card bg-surface p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">语音助手</h3>
            <button onClick={() => setOutcome(null)} aria-label="关闭" className="rounded-full bg-ink-100 p-1.5 text-ink-500">
              <X size={16} />
            </button>
          </div>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {outcome.steps.map((s, i) => (
              <div key={i} className="rounded-btn bg-bg px-3 py-2 text-xs">
                {s.say && (
                  <p className="text-ink-700">
                    🎤 <span className="font-medium">识别：</span>
                    {s.say}
                  </p>
                )}
                {s.act && (
                  <p className="mt-1 text-ink-500">
                    ⚙️ <span className="font-medium">修改：</span>
                    {s.act}
                  </p>
                )}
                {s.result && (
                  <p className="mt-1 text-primary-600">
                    ✅ <span className="font-medium">结果：</span>
                    {s.result}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm font-medium text-ink-800">{outcome.reply}</p>
          {outcome.error && <p className="mt-1 text-[11px] text-danger-600">{outcome.error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setOutcome(null);
                toggleRecord(); // 带上下文继续对话
              }}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-btn bg-ink-100 text-sm font-medium text-ink-700"
            >
              <Mic size={15} /> 继续对话
            </button>
            <button
              onClick={() => {
                setOutcome(null);
                historyRef.current = []; // 清空上下文，开始全新对话
              }}
              className="flex h-11 flex-1 items-center justify-center rounded-btn bg-ink-100 text-sm font-medium text-ink-700"
            >
              新对话
            </button>
          </div>
        </div>
      )}
    </>
  );
}
