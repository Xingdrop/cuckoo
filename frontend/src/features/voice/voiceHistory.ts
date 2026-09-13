/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL2ZlYXR1cmVzL3ZvaWNlL3ZvaWNlSGlzdG9yeS50c3wyMDI2LTA5fDk5ZmMzYjJkM2M= */
/**
 * 语音执行历史（2026-09-13）：只记录「已确认执行」的任务（取消的预案不入库）。
 * 设备本地持久化（localStorage，按账户隔离，上限 50 条）；供历史面板回看
 * 原文/理解/执行结果，并可转为多轮对话上下文供「接着说」使用。
 */
import { useAuthStore } from '../../stores/authStore';

export interface VoiceRecord {
  /** 执行时间 ISO */
  at: string;
  /** 原文（用户确认执行的识别/编辑后文本） */
  text: string;
  /** AI 理解（reply + 动作清单） */
  understanding: string;
  /** 执行结果（逐条 act=result） */
  results: string[];
}

const KEY = 'cuckoo_voice_history';
const CAP = 50;

const storageKey = () => {
  const uid = useAuthStore.getState().user?.id ?? 'guest';
  return `${KEY}:${uid}`;
};

export function loadVoiceHistory(): VoiceRecord[] {
  try {
    const raw = localStorage.getItem(storageKey());
    const arr = raw ? (JSON.parse(raw) as VoiceRecord[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function pushVoiceRecord(r: Omit<VoiceRecord, 'at'>): void {
  try {
    const all = loadVoiceHistory();
    all.unshift({ ...r, at: new Date().toISOString() });
    localStorage.setItem(storageKey(), JSON.stringify(all.slice(0, CAP)));
  } catch {
    /* 存储满/隐私模式 → 静默（历史非关键数据） */
  }
}

/** 最近 N 条记录 → 多轮对话上下文（供「接着说」沿用） */
export function recentVoiceTurns(n = 3): { role: 'user' | 'assistant'; content: string }[] {
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const r of loadVoiceHistory().slice(0, n).reverse()) {
    turns.push({ role: 'user', content: r.text });
    turns.push({ role: 'assistant', content: `${r.understanding}（执行：${r.results.join('；')}）` });
  }
  return turns;
}
