import { Mic, MicOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { loadAiConfig, runAssistant, speechSupported, type AssistantOutcome } from '../../assistant/assistant';

/**
 * #26：语音助手（今日页）——唤醒手势：
 * 长按页面任意处出现跟随手指的圆圈（提示"上滑到麦克风"）→ 把圆圈划入右下角语音按钮 → 开始录音并实时显示识别文字
 * → 松手停止 → AI 按 API 目录执行 → 逐个提示「识别内容 / 修改动作 / 修改结果」。
 */
export function VoiceAssistant({ onToast }: { onToast: (msg: string) => void }) {
  const [enabled, setEnabled] = useState(() => loadAiConfig().enabled);
  const supported = speechSupported();

  const [armed, setArmed] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [live, setLive] = useState('');
  const [outcome, setOutcome] = useState<AssistantOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const micRef = useRef<HTMLButtonElement | null>(null);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const cancelRef = useRef(true);
  const recRef = useRef<{ stop: () => void; transcript: () => string } | null>(null);

  useEffect(() => {
    setEnabled(loadAiConfig().enabled);
  }, []);

  /** 长按检测 + 圆圈跟随 + 划入麦克风 */
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (!enabled) return;
      const t = e.touches[0];
      startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      cancelRef.current = true;
      // 450ms 长按（期间移动 < 14px）→ 显示圆圈
      setTimeout(() => {
        const s = startRef.current;
        if (!s || cancelRef.current) return;
        if (Math.hypot(t.clientX - s.x, t.clientY - s.y) < 14) {
          setArmed(true);
          setPos({ x: s.x, y: s.y });
        }
      }, 450);
    };
    const onMove = (e: TouchEvent) => {
      if (!startRef.current) return;
      const t = e.touches[0];
      if (!armed) {
        // 移动即视为取消长按
        if (Math.hypot(t.clientX - startRef.current.x, t.clientY - startRef.current.y) > 14) {
          cancelRef.current = true;
        }
        return;
      }
      e.preventDefault();
      setPos({ x: t.clientX, y: t.clientY });
      if (!recording) {
        const r = micRef.current?.getBoundingClientRect();
        if (r) {
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          if (Math.hypot(t.clientX - cx, t.clientY - cy) < 46) startRecording();
        }
      }
    };
    const onEnd = () => {
      if (recording) stopRecording();
      cancelRef.current = true;
      startRef.current = null;
      setArmed(false);
      setPos(null);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled, armed, recording]);

  const startRecording = () => {
    if (busy) return;
    if (!supported) {
      onToast('当前环境不支持语音识别（请用手机 Chrome / 安卓浏览器）');
      setArmed(false);
      setPos(null);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        onresult: ((ev: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } }) => void) | null;
        onend: (() => void) | null;
        onerror: ((ev: { error?: string }) => void) | null;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => never;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    let text = '';
    rec.lang = 'zh-CN';
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let interim = '';
      let final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      text = (final + interim).trim();
      setLive(text);
    };
    rec.onerror = () => {
      setRecording(false);
      onToast('语音识别失败（请检查麦克风权限）');
    };
    rec.onend = () => {
      setRecording(false);
      if (text.trim()) void handle(text.trim());
      else onToast('未识别到语音');
    };
    try {
      rec.start();
      recRef.current = { stop: () => rec.stop(), transcript: () => text };
      setLive('');
      setRecording(true);
    } catch {
      onToast('语音识别启动失败');
    }
  };

  const stopRecording = () => {
    recRef.current?.stop();
  };

  const handle = async (text: string) => {
    setBusy(true);
    setLive(text);
    const out = await runAssistant(text);
    setOutcome(out);
    setBusy(false);
    onToast(out.error ? 'AI 处理未完成' : 'AI 已完成处理');
  };

  return (
    <>
      {/* 语音按钮（#26：浅色固定，贴合今日页底部；长按页面任意处上滑把圆圈拖入 */}
      {enabled && (
        <button
          ref={micRef}
          aria-label="语音助手"
          title="长按页面任意处，上滑把圆圈拖到此处说话"
          onClick={() => onToast('长按页面任意处，上滑把圆圈拖到麦克风即可说话')}
          className={`fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium shadow-md transition-all ${
            recording
              ? 'animate-pulse border-danger-500 bg-danger-500 text-white'
              : 'border-ink-100 bg-surface/95 text-primary-700'
          }`}
        >
          {recording ? <MicOff size={13} /> : <Mic size={13} />}
          {recording ? '正在聆听…' : '语音助手'}
        </button>
      )}

      {/* 长按圆圈跟随手指 */}
      {armed && pos && !recording && (
        <div
          className="pointer-events-none fixed z-[70] flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary-500 bg-primary-500/20"
          style={{ left: pos.x, top: pos.y }}
        >
          <span className="text-[10px] font-medium text-primary-700">拖到麦克风</span>
        </div>
      )}

      {/* 录音实时字幕 */}
      {recording && (
        <div className="fixed inset-x-0 top-0 z-[70] border-b border-primary-100 bg-surface/95 px-4 pb-3 pt-4 shadow-sm backdrop-blur">
          <p className="flex items-center gap-2 text-xs text-primary-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-danger-500" />
            正在聆听…（松手结束）
          </p>
          <p className="mt-2 min-h-5 text-sm text-ink-800">{live || '…'}</p>
        </div>
      )}

      {/* 结果面板：识别内容 / 修改动作 / 修改结果 */}
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
