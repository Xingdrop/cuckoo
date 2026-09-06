/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL2ZlYXR1cmVzL3ZvaWNlL3NwZWVjaEFkYXB0ZXIudHN8MjAyNi0wOXw2ZWQzY2RjODBl */
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
    }).catch((e) => handlers.onError?.(String(e).slice(0, 60)));

    return {
      stop: async () => {
        try {
          await handle.remove();
          await SpeechRecognition.stop();
          if (last) handlers.onFinal(last);
        } catch (e) {
          // 部分机型 stop 已自动结束：兜底用已积累的 partial
          if (last) handlers.onFinal(last);
          else handlers.onError?.(String(e).slice(0, 60));
        }
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
    if (!stopped) handlers.onError?.(`识别错误：${e.error}`);
  };
  rec.onend = () => {
    if (stopped) return;
    const t = finalText.trim();
    if (t) handlers.onFinal(t);
  };
  try {
    rec.start();
  } catch (e) {
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
      // onend 兜底 onFinal；若迟迟不触发则直接给已有文本
      setTimeout(() => {
        const t = finalText.trim();
        if (t) handlers.onFinal(t);
      }, 400);
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
