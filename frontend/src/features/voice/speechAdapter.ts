/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL2ZlYXR1cmVzL3ZvaWNlL3NwZWVjaEFkYXB0ZXIudHN8MjAyNi0wOXw2ZWQzY2RjODBl */
import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * 语音听写适配器（跨 Web / APK）：
 * - Web（HTTPS/localhost）：浏览器原生 Web Speech API
 * - APK（Capacitor 原生壳）：WebView 不支持 Web Speech API →
 *   自建 NativeSpeech 原生插件（2026-09-09 深夜 #6：识别器常驻复用 + 会话结束/出错
 *   无缝续听。@capacitor-community/speech-recognition 每次 start 都 destroy+recreate
 *   识别器，配合 Google 端点检测静音 ~1-2s 终止会话，长按期间反复拆建丢词——
 *   「还在长按就中断/没收到语音」的根因）
 *
 * 统一接口：start(onPartial, onFinal) 启动；返回 stop()。
 * 两种实现的「松手即结束、结束给出最终文本」语义一致。
 */

export interface DictationHandle {
  stop: () => Promise<void> | void;
}

/** NativeSpeech 自定义原生插件的 JS 代理（无 npm 包，原生 registerPlugin 注入） */
interface NativeSpeechProxy {
  available: () => Promise<{ available: boolean }>;
  start: (o: { language: string }) => Promise<void>;
  stop: () => Promise<void>;
  checkPermissions: () => Promise<{ speechRecognition: string }>;
  requestPermissions: () => Promise<{ speechRecognition: string }>;
  addListener: (ev: string, cb: (d: never) => void) => Promise<{ remove: () => Promise<void> }>;
}

/**
 * #37（2026-09-10）：引擎解析——系统识别器（NativeSpeech）依赖 ROM 提供的
 * RecognitionService；一加 Ace 3（ColorOS 无 Google 服务、小布不导出）上
 * SpeechRecognizer 整体不可用（永远空结果 →「未识别到语音」）。
 * 探测失败自动降级 NativeVosk（Vosk 中文小模型纯离线识别，事件协议一致）。
 *
 * ⚠️ 2026-09-13 真机实锤：绝不能把 Capacitor 插件代理对象放进 await 链——
 * `await resolveNativeEngine()` 返回代理时，await 会读取代理的 .then 属性，
 * 而 Capacitor 代理对任意属性都生成桥接调用 → "NativeVosk.then() is not
 * implemented on android" → 未处理 rejection → supported 永远 false，
 * Vosk 兜底自上线以来从未真正生效。因此探测函数只返回布尔值，
 * 代理存模块变量 nativeEngine，使用时直接读取。
 */
let nativeEngine: NativeSpeechProxy | null = null;
let nativeEngineName = '';

async function resolveNativeEngine(): Promise<boolean> {
  if (nativeEngine) return true;
  for (const name of ['NativeSpeech', 'NativeVosk']) {
    try {
      const p = registerPlugin(name) as unknown as NativeSpeechProxy;
      const { available } = await p.available();
      if (available) {
        nativeEngine = p;
        nativeEngineName = name;
        return true;
      }
    } catch {
      /* 插件缺失 → 尝试下一个 */
    }
  }
  return false;
}

export async function nativeSpeechAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  return resolveNativeEngine();
}

/** #35：权限缓存——首次 granted 后跳过 checkPermissions（省桥调用，按下即录启动更快） */
let permissionGranted = false;

/** 启动听写：onPartial 实时字幕；onFinal 最终文本（松手或静音结束后调用一次） */
export async function startDictation(handlers: {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (msg: string) => void;
}): Promise<DictationHandle> {
  if (!Capacitor.isNativePlatform() || !(await resolveNativeEngine())) {
    nativeEngine = null;
  }
  const engine = nativeEngine;
  if (engine) {
    // 权限（RECORD_AUDIO）就绪（已授权过则跳过检查，加快启动）
    if (!permissionGranted) {
      const { speechRecognition } = await engine.checkPermissions();
      if (speechRecognition !== 'granted') {
        const req = await engine.requestPermissions();
        if (req.speechRecognition !== 'granted') {
          handlers.onError?.('麦克风/语音识别权限被拒绝，请在系统设置中开启');
          return { stop: () => undefined };
        }
      }
      permissionGranted = true;
    }
    // ===== #6（2026-09-09 深夜）：NativeSpeech 常驻识别器会话模型 =====
    // 原生识别器不销毁；端点检测结束/出错且仍在长按时原生立即续听（新 session 号）。
    // committed=已完成会话全文累计；current=当前会话文本（事件为会话级全文，替换不追加）；
    // 会话边界（session 号变化）时 current 落账进 committed。
    // #37：引擎可为 NativeSpeech（系统识别）或 NativeVosk（离线模型），事件协议一致
    if (import.meta.env.DEV) console.log('[SR] dictation start, engine=', nativeEngineName);
    let committed = '';
    let current = '';
    let currentSession = -1;
    let active = true;
    let finalArrived = false;
    let failed = false;
    let stopped = false;
    let lastEventAt = Date.now();
    const emitFinal = (t: string) => {
      if (failed) return;
      if (import.meta.env.DEV) console.log('[SR] final:', JSON.stringify(t));
      handlers.onFinal(t);
    };
    const show = () => handlers.onPartial(`${committed}${current}`);
    /** 会话边界：上一会话文本落账并清空 current（新会话从零开始——
     *  #31（2026-09-10）：此前漏清 current，下一会话无 partial 时 final 会把旧会话
     *  文本既计入 committed 又留在 current → 拼接重复 */
    const rollSession = (s: number) => {
      if (s !== currentSession) {
        if (current) committed += current;
        current = '';
        currentSession = s;
      }
    };
    const partialHandle = await engine.addListener('partial', (data: { session: number; matches: string[] }) => {
      lastEventAt = Date.now();
      const m = data.matches?.[0] ?? '';
      if (!m) return;
      rollSession(data.session);
      current = m; // 会话级全文：替换语义
      show();
    });
    // 松手后 stopListening 触发的会话最终结果经 final 事件送达——留窗捕获
    const finalHandle = await engine.addListener('final', (data: { session: number; matches: string[] }) => {
      lastEventAt = Date.now();
      rollSession(data.session);
      const m = data.matches?.[0] ?? '';
      if (m) current = m; // 罕见空结果保留 partial 文本
      if (!active) finalArrived = true;
      show();
    });
    // 活性信号；权限缺失(9)原生不续听，必须上报；连续网络/服务错误(2/4)明确提示——
    // #35：此前静默续听表现为「一直没反应 → 松手空文本」，用户无从得知是网络问题
    let netWarned = false;
    const errorHandle = await engine.addListener('srError', (data: { code: number; consecutive?: number }) => {
      lastEventAt = Date.now();
      if (import.meta.env.DEV) console.log('[SR] native srError code=', data.code, 'consecutive=', data.consecutive);
      if (data.code === 9 && !failed) {
        failed = true;
        handlers.onError?.('麦克风/语音识别权限被拒绝，请在系统设置中开启');
        return;
      }
      if (!netWarned && (data.code === 2 || data.code === 4) && (data.consecutive ?? 0) >= 3) {
        netWarned = true;
        failed = true;
        handlers.onError?.('语音识别服务连接异常，请检查网络后重试');
      }
    });
    const stateHandle = await engine.addListener('listeningState', () => {
      lastEventAt = Date.now();
    });
    // watchdog 兜底：识别器卡死（连续 4s 无任何事件）→ 重新 startSession（原生 cancel+start，幂等安全）
    const watchdog = setInterval(() => {
      if (active && Date.now() - lastEventAt > 4000) {
        lastEventAt = Date.now();
        if (import.meta.env.DEV) console.log('[SR] watchdog restart');
        void engine.start({ language: 'zh-CN' }).catch(() => undefined);
      }
    }, 1000);
    // 首次 start 偶发 "recognizer not ready"（load 后 post 未完成）→ 自动重试一次
    const startWithRetry = async () => {
      try {
        await engine.start({ language: 'zh-CN' });
      } catch (e) {
        if (!active || failed) return;
        if (import.meta.env.DEV) console.log('[SR] first start failed, retry:', String(e).slice(0, 80));
        await new Promise((r) => setTimeout(r, 300));
        if (!active || failed) return;
        try {
          await engine.start({ language: 'zh-CN' });
        } catch (e2) {
          failed = true;
          handlers.onError?.(`识别启动失败：${String(e2).slice(0, 40)}`);
        }
      }
    };
    void startWithRetry();

    return {
      stop: async () => {
        // #35：stop 严格一次（VoiceAssistant 竞态路径可能双调）——重复调用不再二次 emitFinal
        if (stopped) return;
        stopped = true;
        if (import.meta.env.DEV) console.log('[SR] dictation stop, committed=', JSON.stringify(committed), 'current=', JSON.stringify(current));
        active = false;
        clearInterval(watchdog);
        // 松手：stopListening 后本会话最终结果经 final 事件送达，留 1.2s 捕获窗
        // （原 800ms——部分机型 onResults 晚到，松手即断丢结尾）
        try {
          await engine.stop();
        } catch {
          /* 已结束 */
        }
        const deadline = Date.now() + 1200;
        while (Date.now() < deadline && !finalArrived && !current) {
          await new Promise((r) => setTimeout(r, 60));
        }
        try {
          await partialHandle.remove();
        } catch {
          /* 已移除 */
        }
        try {
          await finalHandle.remove();
        } catch {
          /* 已移除 */
        }
        try {
          await errorHandle.remove();
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
    // 权限类错误无法自愈：onend 会重启识别造成错误循环 → 先标记 failed 阻断重启并上报
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      failed = true;
      try {
        rec.stop();
      } catch {
        /* 已结束 */
      }
      handlers.onError?.('麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试');
      return;
    }
    // 其余单次错误（no-speech 等）交给 onend 自动重启，不终断
  };
  rec.onend = () => {
    if (stopped) return;
    if (active && !failed) {
      // 仍在录音 → 浏览器静音自动断流，立即重启识别
      try {
        rec.start();
      } catch {
        /* 已在运行等瞬时错误 → 下一轮 onend 再试 */
      }
      return;
    }
    // failed 路径 emitFinal 被守卫拦截（错误已由 onError 上报，语音会话就此结束）
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
