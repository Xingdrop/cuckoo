/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL2ZlYXR1cmVzL3ZvaWNlL1ZvaWNlQXNzaXN0YW50LnRzeHwyMDI2LTA5fDIwZWY2MmQxZTc= */
import { Mic, MicOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { loadAiConfig, runAssistant, type AssistantOutcome } from '../../assistant/assistant';
import { nativeSpeechAvailable, startDictation, type DictationHandle } from './speechAdapter';

/**
 * #26 语音助手 v2（2026-09-06 交互重做）：
 * 长按语音按钮 → 开始识别（实时文字）→ 松手 →
 * AI 解析出「将要进行的调整」预案（不执行）→ 用户点「确认执行」才落地。
 * 识别：APK=原生插件（@capacitor-community/speech-recognition）；浏览器=Web Speech API。
 */

interface PlanState {
  text: string;
  reply: string;
  steps: AssistantOutcome['steps'];
  actions: { id: string; params: Record<string, unknown> }[];
  error?: string;
}

export function VoiceAssistant({ onToast }: { onToast: (msg: string) => void }) {
  const [enabled, setEnabled] = useState(() => loadAiConfig().enabled);
  const [supported, setSupported] = useState(false);

  const [recording, setRecording] = useState(false);
  const [live, setLive] = useState('');
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [outcome, setOutcome] = useState<AssistantOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const recRef = useRef<DictationHandle | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressingRef = useRef(false);

  useEffect(() => {
    setEnabled(loadAiConfig().enabled);
    // 支持检测（2026-09-06 修复）：原生插件可用 **或** 浏览器有 Web Speech API 都算支持——
    // 之前只检测原生插件，导致 Web 端长按永远提示"不支持"，Web Speech 路径成死代码
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const webOk = !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
    void nativeSpeechAvailable().then((n) => setSupported(n || webOk));
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  /** 长按按钮（≥350ms）开始识别；松手结束识别 → 出预案 */
  const onPointerDown = () => {
    if (!enabled || busy || recording) return;
    pressingRef.current = true;
    holdTimer.current = setTimeout(() => {
      if (!pressingRef.current) return;
      if (!supported) {
        onToast('当前环境不支持语音识别（浏览器需 HTTPS；APK 请更新到含语音插件的新版本）');
        return;
      }
      void startDictation({
        onPartial: (t) => setLive(t),
        onFinal: (t) => {
          setRecording(false);
          void makePlan(t.trim());
        },
        onError: (msg) => {
          setRecording(false);
          onToast(msg);
        },
      }).then((h) => {
        if (!pressingRef.current) {
          // 2026-09-07：识别就绪前已松手（异步启动竞态）→ 直接结束，避免卡在「松手结束」
          void h.stop();
          return;
        }
        recRef.current = h;
        setLive('');
        setRecording(true);
      });
    }, 350);
  };

  const onPointerUp = () => {
    pressingRef.current = false;
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (recording) {
      void recRef.current?.stop();
    } else {
      // 2026-09-06 修复：未开启/快速点击也要有反馈（此前未开启时点击完全无响应）
      onToast(
        !enabled
          ? '语音助手未开启：设置 → 语音助手 可开启'
          : '长按按钮说话，松手后确认要执行的调整',
      );
    }
  };

  /** 松手后：AI 解析预案（不执行） */
  const makePlan = async (text: string) => {
    if (!text) {
      onToast('未识别到语音');
      return;
    }
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
    const { executePending } = await import('../../assistant/assistant');
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
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          if (recording) onPointerUp();
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
                  {s.result && <p className="mt-1 text-ink-400">{s.result}</p>}
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
