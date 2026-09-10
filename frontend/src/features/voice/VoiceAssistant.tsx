/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL2ZlYXR1cmVzL3ZvaWNlL1ZvaWNlQXNzaXN0YW50LnRzeHwyMDI2LTA5fDIwZWY2MmQxZTc= */
import { Mic, MicOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { nativeSpeechAvailable, startDictation, type DictationHandle } from './speechAdapter';
import { loadAiConfig, runAssistant, executePending } from '../../assistant/assistant';

/**
 * 语音助手入口：底部悬浮「长按说话」按钮。
 *
 * #35（2026-09-10 深夜）长按手势整体重构——多轮小修仍报中断/丢字，根因是手势层
 * 结构性缺陷，本次重写状态机：
 * 1. 按下立即开始录音（原 350ms holdTimer + 异步启动桥延迟 ~0.5s，开头语音全丢）；
 * 2. 松手监听挂 document 捕获阶段（原按钮级 onPointerUp 在真机上不可靠——滑出/
 *    系统手势注入时事件丢失，录音永不结束或被 pointercancel 误杀）；
 * 3. 识别就绪前松手的竞态显式建模（stopPending → 就绪后立即 stop）；
 * 4. 短按误触（<350ms）与空识别结果静默丢弃，不再弹「未识别到语音」；
 * 5. stop 严格一次（recRef 置空防重入），杜绝重复 emitFinal → 重复弹预案。
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

/** 误触阈值：短于该时长的按压视为误触，结果静默丢弃 */
const PRESS_MS_MIN = 350;

export function VoiceAssistant({ onToast }: { onToast: (msg: string) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [live, setLive] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const recRef = useRef<DictationHandle | null>(null);
  const docRef = useRef<{ up: EventListener; cancel: EventListener } | null>(null);
  const pressingRef = useRef(false);
  const pressStartRef = useRef(0);
  const stopPendingRef = useRef(false);

  useEffect(() => {
    setEnabled(loadAiConfig().enabled);
    // 支持检测：原生插件可用 **或** 浏览器有 Web Speech API 都算支持
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const webOk = !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
    void nativeSpeechAvailable().then((n) => setSupported(n || webOk));
    return () => {
      // 卸载兜底：停录音 + 摘 document 监听
      pressingRef.current = false;
      const h = recRef.current;
      recRef.current = null;
      void h?.stop();
      detachDoc();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 松手监听挂 document 捕获阶段：无论手指滑到哪/系统是否注入手势，up/cancel 必达 */
  const attachDoc = () => {
    if (docRef.current) return;
    const up = () => endPress();
    const cancel = () => endPress();
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
    docRef.current = { up, cancel };
  };
  const detachDoc = () => {
    if (!docRef.current) return;
    document.removeEventListener('pointerup', docRef.current.up, true);
    document.removeEventListener('pointercancel', docRef.current.cancel, true);
    docRef.current = null;
  };

  /** 结束按压（幂等）：stop 严格一次（recRef 立即置空），未就绪则标记 pending */
  const endPress = () => {
    if (!pressingRef.current) return;
    pressingRef.current = false;
    const h = recRef.current;
    if (h) {
      recRef.current = null;
      void h.stop();
    } else if (stopPendingRef.current !== null) {
      stopPendingRef.current = true; // 识别启动中松手 → 就绪后立即停
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled || busy || recording) {
      if (!enabled) onToast('语音助手未开启：设置 → 语音助手 可开启');
      return;
    }
    if (!supported) {
      onToast('当前环境不支持语音识别（浏览器需 HTTPS；APK 请更新到含语音插件的新版本）');
      return;
    }
    // 指针捕获：手指滑出按钮事件仍送达（触摸场景系统隐式捕获不可靠）
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 不支持则退化为 document 级监听兜底 */
    }
    pressingRef.current = true;
    pressStartRef.current = Date.now();
    stopPendingRef.current = false;
    recRef.current = null;
    setLive('');
    setRecording(true); // 乐观进入录音态：UI 即刻反馈
    attachDoc();
    void startDictation({
      onPartial: (t) => setLive(t),
      onFinal: (t) => {
        detachDoc();
        setRecording(false);
        const text = t.trim();
        const held = Date.now() - pressStartRef.current;
        // 误触（<350ms）或空结果：静默丢弃，不再弹「未识别到语音」
        if (!text || held < PRESS_MS_MIN) return;
        void makePlan(text);
      },
      onError: (msg) => {
        detachDoc();
        setRecording(false);
        onToast(msg);
      },
    }).then((h) => {
      recRef.current = h;
      if (!pressingRef.current || stopPendingRef.current) {
        // 就绪前已松手 → 立即停（结果经 onFinal 的误触判定静默/正常处理）
        recRef.current = null;
        void h.stop();
      }
    });
  };

  /** 松手后：AI 解析预案（不执行） */
  const makePlan = async (text: string) => {
    setBusy(true);
    setLive(text);
    const out = await runAssistant(text, { autoRun: false });
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

  /** 确认执行预案 */
  const confirmPlan = async () => {
    if (!plan || busy) return;
    setBusy(true);
    const out = await executePending(plan.actions, plan.text);
    setBusy(false);
    setPlan(null);
    setOutcome(out);
    onToast(out.error ? 'AI 执行未完成' : 'AI 已完成调整');
  };

  return (
    <>
      <button
        ref={btnRef}
        aria-label="语音助手（长按说话）"
        onPointerDown={onPointerDown}
        onPointerLeave={(e) => {
          // 鼠标按住拖出视为放弃；触摸由 document 监听统一处理
          if (e.pointerType === 'mouse' && recording) endPress();
        }}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        className={`fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 select-none items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium shadow-md ${
          recording
            ? 'animate-pulse border-danger-500 bg-danger-500 text-white'
            : enabled
              ? 'border-ink-100 bg-surface/95 text-primary-700'
              : 'border-ink-100 bg-surface/70 text-ink-300'
        }`}
      >
        {recording ? <MicOff size={13} /> : <Mic size={13} />}
        {recording ? '松手结束' : enabled ? '长按说话' : '语音助手（未开启）'}
      </button>

      {/* 识别实时字幕 */}
      {recording && (
        <div className="fixed inset-x-0 top-0 z-[70] border-b border-primary-100 bg-surface/95 px-4 pb-3 pt-4 shadow-sm">
          <p className="flex items-center gap-2 text-xs text-primary-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-danger-500" />
            正在聆听…（松手结束）
          </p>
          <p className="mt-2 min-h-5 text-sm text-ink-800">{live || <span className="text-ink-300">|</span>}</p>
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
          <p className="mt-2 rounded-btn bg-bg px-3 py-2 text-sm text-ink-700">🎤 {plan.text}</p>
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
          <button
            onClick={() => setOutcome(null)}
            className="mt-3 w-full rounded-btn bg-primary-500 py-2.5 text-sm font-medium text-white"
          >
            好的
          </button>
        </div>
      )}
    </>
  );
}
