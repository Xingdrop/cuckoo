import { createPortal } from 'react-dom';
import { AlarmClock, Camera, Check, ChevronRight, Image as ImageIcon, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { http } from '../../services/http';
import type { Reminder } from '../../types';
import type { useReminderScheduler } from './useReminderScheduler';

const CATEGORY_EMOJI: Record<string, string> = {
  medication: '💊',
  exercise: '🏃',
  water: '💧',
  rest: '😴',
  work: '💼',
  custom: '📌',
};

const DELAY_PRESETS = [5, 10, 15, 30];

interface Props {
  reminder: Reminder;
  onAction: ReturnType<typeof useReminderScheduler>['handleAction'];
}

/**
 * P-06 提醒全屏弹窗（FR-204~207）
 * 触发后全屏遮罩展示内容；提供 完成 / 延迟 / 跳过 操作。
 * 拍照挑战（FR-208）在 M3 接入：开启 challenge 时先进入拍照步骤。
 */
export function ReminderOverlay({ reminder, onAction }: Props) {
  const [showDelay, setShowDelay] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (
    status: 'completed' | 'delayed' | 'skipped' | 'challenge_completed',
    minutes?: number,
    photoUrl?: string,
  ) => {
    setBusy(true);
    await onAction(status, minutes, photoUrl);
  };

  const maxDelayCount = reminder.delaySettings.maxDelayCount ?? 3;
  const customEnabled = reminder.delaySettings.customEnabled ?? true;

  /** 拍照/相册选择 → 上传 → 完成挑战 */
  const uploadAndComplete = async (file: File) => {
    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await http.post<{ url: string }>('/files/upload', fd);
      await act('challenge_completed', undefined, data.url);
    } catch {
      setPhotoBusy(false);
    }
  };

  const submitCustom = async () => {
    const m = Number(customMinutes);
    if (!Number.isInteger(m) || m < 1 || m > 1440) return;
    await act('delayed', m);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-primary-900 text-white">
      {/* 顶部 */}
      <div className="flex items-center justify-between px-6 pt-8">
        <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm">
          <AlarmClock size={16} />
          提醒时间到
        </span>
        <span className="text-2xl">{CATEGORY_EMOJI[reminder.category] ?? '📌'}</span>
      </div>

      {/* 内容 */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <h2 className="text-3xl font-bold leading-snug">{reminder.title}</h2>
        {reminder.content.text && (
          <p className="mt-4 text-lg leading-relaxed text-white/80">{reminder.content.text}</p>
        )}
        {reminder.challenge.enabled && (
          <div className="mt-6 w-full">
            {showCamera ? (
              <div className="rounded-card bg-white/10 p-5">
                <p className="mb-3 text-center text-sm text-white/80">拍摄打卡照片</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadAndComplete(f);
                  }}
                />
                <input
                  ref={galleryRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadAndComplete(f);
                  }}
                />
                <div className="flex gap-3">
                  <button
                    disabled={photoBusy}
                    onClick={() => fileRef.current?.click()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-btn bg-white/15 py-3.5 text-sm transition-colors hover:bg-white/25 disabled:opacity-50"
                  >
                    <Camera size={18} /> {photoBusy ? '上传中…' : '拍照'}
                  </button>
                  <button
                    disabled={photoBusy}
                    onClick={() => galleryRef.current?.click()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-btn bg-white/15 py-3.5 text-sm transition-colors hover:bg-white/25 disabled:opacity-50"
                  >
                    <ImageIcon size={18} /> 相册
                  </button>
                </div>
                <button
                  disabled={photoBusy}
                  onClick={() => setShowCamera(false)}
                  className="mt-3 w-full py-2 text-sm text-white/60"
                >
                  返回
                </button>
              </div>
            ) : (
              <>
                <p className="rounded-full bg-accent-500/20 px-4 py-2 text-center text-sm text-accent-300">
                  📸 拍照打卡挑战：完成后自动记录
                </p>
                <button
                  onClick={() => setShowCamera(true)}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-card bg-accent-500 py-3.5 text-base font-semibold text-white transition-colors hover:bg-accent-700"
                >
                  <Camera size={20} /> 开始拍照打卡
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 操作区 */}
      <div className="space-y-3 px-6 pb-10">
        {showDelay ? (
          <div className="rounded-card bg-white/10 p-4">
            <p className="mb-3 text-sm text-white/70">延迟多久再提醒？</p>
            <div className="grid grid-cols-4 gap-2">
              {DELAY_PRESETS.map((m) => (
                <button
                  key={m}
                  disabled={busy}
                  onClick={() => act('delayed', m)}
                  className="rounded-btn bg-white/15 py-2.5 text-sm transition-colors hover:bg-white/25 disabled:opacity-50"
                >
                  {m}分
                </button>
              ))}
            </div>
            {customEnabled && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  placeholder="自定义分钟"
                  className="w-full rounded-btn bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/40 outline-none"
                />
                <button
                  disabled={busy || !customMinutes}
                  onClick={submitCustom}
                  className="shrink-0 rounded-btn bg-white/20 px-4 py-2.5 text-sm transition-colors hover:bg-white/30 disabled:opacity-50"
                >
                  确定
                </button>
              </div>
            )}
            <button
              onClick={() => setShowDelay(false)}
              className="mt-3 w-full py-2 text-sm text-white/60"
            >
              返回
            </button>
          </div>
        ) : (
          <>
            <button
              disabled={busy}
              onClick={() => act('completed')}
              className="flex w-full items-center justify-center gap-2 rounded-card bg-primary-500 py-4 text-lg font-semibold transition-colors hover:bg-primary-400 disabled:opacity-50"
            >
              <Check size={22} /> 完成
            </button>
            <div className="flex gap-3">
              {maxDelayCount > 0 && (
                <button
                  disabled={busy}
                  onClick={() => setShowDelay(true)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-card bg-white/10 py-3.5 text-base transition-colors hover:bg-white/20"
                >
                  延迟 <ChevronRight size={18} />
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => act('skipped')}
                className="flex flex-1 items-center justify-center gap-1 rounded-card bg-white/10 py-3.5 text-base transition-colors hover:bg-white/20"
              >
                <X size={18} /> 跳过
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
