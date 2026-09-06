/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3V0aWxzL2FsZXJ0LWZlZWRiYWNrLnRzfDIwMjYtMDl8NzIwZTgxMmNkYg== */
import { authApi } from '../services/api/api.auth';
import { useLocal } from '../guest/localMode';
import { useGuestStore } from '../guest/guestStore';

/**
 * 提醒弹窗反馈（震动 + 响铃，2026-09-06）：
 * - 偏好读取：离线/镜像走 guestStore.settings；在线走 authApi.getSettings（设置页「提醒时播放铃声/震动」）
 * - 震动：navigator.vibrate 循环（APK WebView 与安卓 Chrome 支持；桌面端自动无效）
 * - 响铃：Web Audio 合成双音铃声循环——不引音频资源；受浏览器自动播放策略限制时，
 *   首次交互（pointerdown）自动恢复；两者均返回 stop() 由弹窗卸载/用户操作时调用
 */
export interface FeedbackPrefs {
  sound: boolean;
  vibrate: boolean;
}

export async function loadFeedbackPrefs(): Promise<FeedbackPrefs> {
  try {
    if (useLocal()) {
      const s = useGuestStore.getState().settings;
      return { sound: s.soundEnabled !== false, vibrate: s.vibrationEnabled !== false };
    }
    const s = await authApi.getSettings();
    return { sound: s.soundEnabled !== false, vibrate: s.vibrationEnabled !== false };
  } catch {
    return { sound: true, vibrate: true };
  }
}

/** 震动循环：返回 stop() */
export function startVibrateLoop(): () => void {
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== 'function') return () => undefined;
  const pattern = [420, 180, 420, 180, 900];
  nav.vibrate(pattern);
  const timer = setInterval(() => nav.vibrate!(pattern), 2400);
  return () => {
    clearInterval(timer);
    nav.vibrate!(0);
  };
}

/** 合成铃声循环（双音交替）：返回 stop() */
export function startRingLoop(): () => void {
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AC = w.AudioContext ?? w.webkitAudioContext;
  if (!AC) return () => undefined;
  let ctx: AudioContext;
  try {
    ctx = new AC();
  } catch {
    return () => undefined;
  }
  // 自动播放策略：挂起时等首次交互恢复
  const resume = () => void ctx.resume().catch(() => undefined);
  if (ctx.state === 'suspended') {
    document.addEventListener('pointerdown', resume, { once: true });
  }
  let stopped = false;
  const beep = (freq: number, dur: number) => {
    if (stopped) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch {
      /* 静默 */
    }
  };
  const ringOnce = () => {
    beep(880, 0.28);
    setTimeout(() => beep(660, 0.28), 340);
  };
  ringOnce();
  const timer = setInterval(ringOnce, 1100);
  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('pointerdown', resume);
    void ctx.close().catch(() => undefined);
  };
}
