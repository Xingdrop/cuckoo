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
    // ===== 2026-09-09 晚重构：committed/current 会话模型 =====
    // 插件 Android 实现（源码已核）：partialResults:true 时 start() 先 resolve，
    // 原生 onError→call.reject 对 JS 不可见（call 已答复）；静音 ~2s 识别器自动结束且无通知；
    // 每次 start() 都 destroy+recreate。旧版 restart 在 stop→start 窗口里把 last 清零，
    // stopListening 触发的最终结果晚到 → 丢词/重复拼接 →「还在长按就没收到语音」。
    // 现在：current=当前会话全文（插件每次事件都带会话级全文，替换不追加），
    // committed=已完成语句；重启边界 committed+=current；松手等待窗内事件替换 current（不叠加）。
    console.log('[SR] dictation start (native)');
    let committed = '';
    let current = '';
    let active = true;
    let restarting = false;
    let lastEventAt = Date.now();
    let finished = false;
    let failed = false;
    const emitFinal = (t: string) => {
      if (finished || failed) return;
      finished = true;
      console.log('[SR] final:', JSON.stringify(t));
      handlers.onFinal(t);
    };
    const show = () => handlers.onPartial(`${committed}${current}`);
    const partialHandle = await SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
      lastEventAt = Date.now();
      const m = data.matches?.[0] ?? '';
      if (m) {
        current = m; // 会话级全文：替换语义
        show();
      }
    });
    // 说话开始/结束事件也计入活跃度——识别服务预热期无 partial，避免被误判停摆重启
    const stateHandle = await SpeechRecognition.addListener('listeningState', () => {
      lastEventAt = Date.now();
    });
    const startOnce = async () => {
      await SpeechRecognition.start({
        language: 'zh-CN',
        maxResults: 1,
        partialResults: true,
        popup: false, // false 才有 partialResults（且不遮挡手势层）
      });
    };
    const restart = async () => {
      if (!active || restarting) return;
      restarting = true;
      try {
        console.log('[SR] restart, committed=', JSON.stringify(committed), 'current=', JSON.stringify(current));
        // 当前会话文本落账（识别器将被销毁，stop 触发的最终结果晚到也不重复计）
        if (current) {
          committed += current;
          current = '';
          show();
        }
        try {
          await SpeechRecognition.stop();
        } catch {
          /* 可能已自行结束 */
        }
        // 留出 stopListening→onResults 事件窗口；该事件只做活性刷新，不再叠加文本
        await new Promise((r) => setTimeout(r, 350));
        if (!active) {
          restarting = false;
          return;
        }
        await startOnce();
        console.log('[SR] restarted ok');
      } catch (e) {
        console.log('[SR] restart failed:', String(e).slice(0, 80));
        /* 启动失败（busy 等瞬时）→ lastEventAt 保持旧值，watchdog 下一轮再试 */
      } finally {
        // 无论成败都推进活跃时钟，保证重试间隔 ≥ 阈值，避免紧密空转
        lastEventAt = Date.now();
        restarting = false;
      }
    };
    const watchdog = setInterval(() => {
      if (active && !restarting && Date.now() - lastEventAt > 2500) void restart();
    }, 1000);
    // 首次 start 偶发 busy（上一会话未完全释放）→ 自动重试一次，仍失败才报错
    const startWithRetry = async () => {
      try {
        await startOnce();
      } catch (e) {
        if (finished || !active) return;
        console.log('[SR] first start failed, retry:', String(e).slice(0, 80));
        await new Promise((r) => setTimeout(r, 400));
        if (!active || finished) return;
        try {
          await startOnce();
        } catch (e2) {
          failed = true;
          handlers.onError?.(friendlySrError(String(e2 ?? e)));
        }
      }
    };
    void startWithRetry();

    return {
      stop: async () => {
        console.log('[SR] dictation stop, committed=', JSON.stringify(committed), 'current=', JSON.stringify(current));
        active = false;
        clearInterval(watchdog);
        // 松手：stopListening 后最终 matches 经 partialResults 事件送达（源码核实），
        // 留 800ms 捕获窗；事件为会话级全文 → 替换 current（不叠加，杜绝重复拼接）
        try {
          await SpeechRecognition.stop();
        } catch {
          /* 部分机型已自动结束 */
        }
        const deadline = Date.now() + 800;
        while (Date.now() < deadline && !current) {
          await new Promise((r) => setTimeout(r, 80));
        }
        try {
          await partialHandle.remove();
        } catch {
          /* 已移除 */
        }
        try {
          await stateHandle.remove();
        } catch {
          /* 已移除 */
        }
        emitFinal(`${committed}${current}`.trim());
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
  // 2026-09-07（#9）：长按期间浏览器静音 ~5s 会自动结束识别 → continuous + onend 自动重启，按住期间持续聆听
  rec.continuous = true;
  let finalText = '';
  let stopped = false;
  let active = true; // 按住中（stop() 才置 false）——onend 时用于区分「松手结束」与「浏览器自动断流」
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
    if (!stopped && !active) {
      failed = true;
      handlers.onError?.(`识别错误：${e.error}`);
    }
    // 按住期间的单次错误（no-speech 等）交给 onend 自动重启，不终断
  };
  rec.onend = () => {
    if (stopped) return;
    if (active) {
      // 仍在长按 → 浏览器自动断流，立即重启识别
      try {
        rec.start();
      } catch {
        /* 已在运行等瞬时错误 → 下一轮 onend 再试 */
      }
      return;
    }
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
      active = false;
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
