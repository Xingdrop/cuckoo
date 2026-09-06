/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8c3JjL2ZlYXR1cmVzL3ZvaWNlL3NwZWVjaEFkYXB0ZXIudHN8MjAyNi0wOXxhZmRlOGQ1MDFi */
import { Capacitor } from '@capacitor/core';

/**
 * 语音听写适配器（跨 Web / APK）：
 * - Web（HTTPS/localhost）：浏览器原生 Web Speech API
 * - APK（Capacitor 原生壳）：WebView 不支持 Web Speech API →
 *   使用 @capacitor-community/speech-recognition（Android 原生 SpeechRecognizer 桥接）
 *
 * 统一接口：start(onPartial, onFinal) 启动；返回 stop()。
 * 两种实现的「松手即结束、结束给出最终文本」语义一致。
 */

export interface DictationHandle {
  stop: () => Promise<void> | void;
}

export async function nativeSpeechAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
    const { available } = await SpeechRecognition.available();
    return available;
  } catch {
    return false;
  }
}

/** 原生识别错误码 → 用户可读提示（2026-09-07：避免英文原文/数字码直接弹出） */
function friendlySrError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('no match')) return '没有听清，请靠近手机、说完再松手';
  if (s.includes('timeout')) return '没检测到语音：请按住按钮后再说话';
  if (s.includes('network')) return '语音识别需要联网，请检查网络后重试';
  if (s.includes('busy')) return '识别服务忙，请等 1 秒再按住重试';
  if (s.includes('permission')) return '麦克风/语音识别权限被拒绝，请在系统设置中开启';
  if (s.includes('audio')) return '麦克风被占用，请关闭其他录音应用后重试';
  return `识别失败：${raw.slice(0, 40)}`;
}

/** 启动听写：onPartial 实时字幕；onFinal 最终文本（松手或静音结束后调用一次） */
export async function startDictation(handlers: {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (msg: string) => void;
}): Promise<DictationHandle> {
  if (await nativeSpeechAvailable()) {
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
    // 权限（RECORD_AUDIO）就绪
    const { speechRecognition } = await SpeechRecognition.checkPermissions();
    if (speechRecognition !== 'granted') {
      const req = await SpeechRecognition.requestPermissions();
      if (req.speechRecognition !== 'granted') {
        handlers.onError?.('麦克风/语音识别权限被拒绝，请在系统设置中开启');
        return { stop: () => undefined };
      }
    }
    let last = '';
    // 2026-09-07（#9）：onFinal 必须恰好回调一次（含空文本）——此前松手时若无识别文本
    // onFinal 永不触发，上层 recording 状态卡死（按钮一直显示「松手结束」）
    let finished = false;
    let failed = false;
    const emitFinal = (t: string) => {
      if (finished || failed) return;
      finished = true;
      handlers.onFinal(t);
    };
    const handle = await SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
      const m = data.matches?.[0] ?? '';
      if (m && m !== last) {
        last = m;
        handlers.onPartial(m);
      }
    });
    void SpeechRecognition.start({
      language: 'zh-CN',
      maxResults: 1,
      partialResults: true,
      popup: false, // false 才有 partialResults（且不遮挡手势层）
    }).catch((e) => {
      if (finished) return; // 松手后的正常结束不当年错误
      failed = true;
      handlers.onError?.(friendlySrError(String(e)));
    });

    return {
      stop: async () => {
        // 2026-09-07（真机修复「一说话就中断提示未识别到语音」）：
        // 原生识别器的最终 matches 在 stopListening() 之后才经 onResults→partialResults 事件送达，
        // 必须先调 stop() 并留出短暂窗口接住最终结果，再移除监听；否则 last 恒为空 → 误报「未识别到语音」
        try {
          await SpeechRecognition.stop();
        } catch {
          /* 部分机型已自动结束 */
        }
        await new Promise((r) => setTimeout(r, 600));
        try {
          await handle.remove();
        } catch {
          /* 已移除 */
        }
        emitFinal(last);
      },
    };
  }

  // ===== Web：Web Speech API =====
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!SR) {
    handlers.onError?.('当前环境不支持语音识别（浏览器需 HTTPS/localhost；APK 需安装含原生插件的版本）');
    return { stop: () => undefined };
  }
  const rec = new SR();
  rec.lang = 'zh-CN';
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = '';
  let stopped = false;
  // 2026-09-07（#9）：onFinal 恰好一次（含空文本）——松手无文本时也必须结束 recording，
  // 否则按钮卡在「松手结束」；onerror 后不再 emitFinal（错误路径已结束状态）
  let finished = false;
  let failed = false;
  const emitFinal = (t: string) => {
    if (finished || failed) return;
    finished = true;
    handlers.onFinal(t);
  };
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    const live = (finalText + interim).trim();
    if (live) handlers.onPartial(live);
  };
  rec.onerror = (e) => {
    if (!stopped) {
      failed = true;
      handlers.onError?.(`识别错误：${e.error}`);
    }
  };
  rec.onend = () => {
    if (stopped) return;
    emitFinal(finalText.trim());
  };
  try {
    rec.start();
  } catch (e) {
    failed = true;
    handlers.onError?.(String(e).slice(0, 60));
  }
  return {
    stop: () => {
      stopped = true;
      try {
        rec.stop();
      } catch {
        /* 已结束 */
      }
      // onend 兜底 onFinal；若迟迟不触发则直接给已有文本（含空文本——保证终态）
      setTimeout(() => emitFinal(finalText.trim()), 400);
    },
  };
}

/** Web Speech API 最小类型（避免引用 DOM lib 中可选类型） */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
