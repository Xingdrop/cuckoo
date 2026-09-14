/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL2ZlYXR1cmVzL3ZvaWNlL3ZvaWNlUHJlZi50c3wyMDI2LTA5fDNlYWZhZDI3NDk= */ */
/**
 * 语音助手输入方式（2026-09-14 用户）：底部悬浮按钮按「语音识别」还是「直接打字」工作。
 * 仅存本机；设置页与悬浮按钮双向同步（变更时广播 cuckoo:voice-mode）。
 */

export type VoiceInputMode = 'voice' | 'type';

const KEY = 'cuckoo_voice_input_mode';
export const VOICE_MODE_EVENT = 'cuckoo:voice-mode';

export function loadInputMode(): VoiceInputMode {
  try {
    return localStorage.getItem(KEY) === 'type' ? 'type' : 'voice';
  } catch {
    return 'voice';
  }
}

export function saveInputMode(mode: VoiceInputMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* 存储不可用：仅本次会话生效 */
  }
  window.dispatchEvent(new CustomEvent(VOICE_MODE_EVENT, { detail: mode }));
}
