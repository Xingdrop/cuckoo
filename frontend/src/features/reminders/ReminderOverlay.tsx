/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL2ZlYXR1cmVzL3JlbWluZGVycy9SZW1pbmRlck92ZXJsYXkudHN4fDIwMjYtMDl8NTBkMTgzNzBkMQ== */
import { createPortal } from 'react-dom';
import { AlarmClock, Camera, Check, ChevronRight, Image as ImageIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { filesApi } from '../../services/api/api.files';
import { LinkedText } from '../../components/LinkedText';
import { MediaCarousel } from '../../components/MediaCarousel';
import { RImg } from '../../components/remoteMedia';
import { loadFeedbackPrefs, startRingLoop, startVibrateLoop } from '../../utils/alert-feedback';
import { captureNativePhoto } from '../../utils/cameraCapture';
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
  /** 拍照语义：challenge=挑战打卡（challenge_completed）；log=随手拍照记录（photo） */
  const [photoMode, setPhotoMode] = useState<'challenge' | 'log'>('challenge');
  const [photoBusy, setPhotoBusy] = useState(false);
  /** #9a（2026-09-09 晚）：拍照/选图上传成功后立即回显（photo 记录不关弹窗，可重拍替换） */
  const [snapped, setSnapped] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  /** #4：3 分钟后自动停止响铃/震动并标记已错过（弹窗保留，仍可补操作） */
  const [missed, setMissed] = useState(false);
  const stopsRef = useRef<(() => void)[]>([]);

  /** 震动 + 响铃（2026-09-06）：按设置页偏好开关；3 分钟后或弹窗卸载时停止 */
  useEffect(() => {
    let cancelled = false;
    void loadFeedbackPrefs().then((p) => {
      if (cancelled) return;
      if (p.vibrate) stopsRef.current.push(startVibrateLoop());
      if (p.sound) stopsRef.current.push(startRingLoop());
    });
    // #4：3 分钟自动停止 + 提示已错过（记录 missed 日志，当日列表立即归入已错过）
    const missedTimer = setTimeout(() => {
      setMissed(true);
      stopsRef.current.forEach((s) => s());
      stopsRef.current = [];
      void onAction('missed');
    }, 180_000);
    return () => {
      cancelled = true;
      clearTimeout(missedTimer);
      stopsRef.current.forEach((s) => s());
      stopsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (
    status: 'completed' | 'delayed' | 'skipped' | 'challenge_completed' | 'photo',
    minutes?: number,
    photoUrl?: string,
  ) => {
    setBusy(true);
    try {
      await onAction(status, minutes, photoUrl, note.trim() || undefined);
    } finally {
      // #3（2026-09-09 深夜）：photo/missed 不关弹窗，busy 必须复位——
      // 此前 setBusy(true) 后无 finally，拍照后完成/延迟/放弃全部卡在 disabled
      setBusy(false);
    }
  };

  const maxDelayCount = reminder.delaySettings.maxDelayCount ?? 3;
  const customEnabled = reminder.delaySettings.customEnabled ?? true;

  /** 拍照/相册选择 → 上传 → 立即回显 → 完成挑战或拍照记录 */
  const uploadAndComplete = async (file: File) => {
    setPhotoBusy(true);
    try {
      const { url } = await filesApi.upload(file);
      setSnapped(url);
      await act(photoMode === 'challenge' ? 'challenge_completed' : 'photo', undefined, url);
    } catch {
      /* 上传失败：photoBusy 复位后留在相机区可重试 */
    } finally {
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

      {/* #4：3 分钟无操作 → 自动停止提示并标记已错过（仍可补完成/延迟/放弃） */}
      {missed && (
        <div className="mx-6 mt-4 rounded-card bg-danger-500/20 px-4 py-2.5 text-center text-sm font-medium text-danger-300">
          ⏰ 已超过 3 分钟，已记为「已错过」——仍可补完成或放弃
        </div>
      )}

      {/* 内容：#2 通知不通报提醒内容说明——仅标题；详情可到今日页点击查看 */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-8 py-4 text-center">
        <h2 className="text-3xl font-bold leading-snug">{reminder.title}</h2>
        {reminder.content.text && (
          <p className="mt-4 text-lg leading-relaxed text-white/80">
            <LinkedText text={reminder.content.text} />
          </p>
        )}
        {/* #2：外部链接（视频/文档/网页等，点击跳转外部应用） */}
        {reminder.content.linkUrl && (
          <a
            href={reminder.content.linkUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white"
          >
            🔗 打开链接
          </a>
        )}
        {/* 媒体（#3：图片/视频；#26 改为滑动轮播——多图跟练可逐张滑动，点击可全屏查看） */}
        {((reminder.content.imageUrls?.length ?? 0) > 0 || reminder.content.videoUrl) && (
          <MediaCarousel
            urls={[
              ...(reminder.content.imageUrls ?? []),
              ...(reminder.content.videoUrl ? [reminder.content.videoUrl] : []),
            ]}
            aspect="aspect-[3/4]"
            className="mt-4 w-full"
          />
        )}
        {/* 2026-09-06：可选文字记录（随手记，随完成/跳过/拍照一并上报，≤500 字） */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="随手记一句（可选，≤500 字）"
          className="mt-5 w-full shrink-0 rounded-card border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none resize-none focus:border-white/30"
        />
        {showCamera ? (
          <div className="mt-6 w-full shrink-0 rounded-card bg-white/10 p-5">
            <p className="mb-3 text-center text-sm text-white/80">
              {photoMode === 'challenge' ? '拍摄打卡照片' : '拍照记录（可拍照或从相册选择）'}
            </p>
            {/* #9a：拍完立即回显——照片已上传记录，可重拍替换（原槽 photo 日志，后端幂等替换） */}
            {snapped && (
              <div className="mb-3 flex items-center gap-3">
                <RImg src={snapped} alt="已拍照片" className="h-24 w-24 shrink-0 rounded-card object-cover" />
                <p className="text-xs leading-5 text-primary-300">
                  ✓ 照片已记录
                  <br />
                  可重拍替换，或返回继续处理提醒
                </p>
              </div>
            )}
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
                onClick={async () => {
                  // #8（2026-09-07）：APK 走原生相机插件（WebView file chooser 会闪退）；Web 回退 input
                  const f = await captureNativePhoto();
                  if (f) void uploadAndComplete(f);
                  else if (f === undefined) fileRef.current?.click();
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-btn bg-white/15 py-3.5 text-sm transition-colors hover:bg-white/25 disabled:opacity-50"
              >
                <Camera size={18} /> {photoBusy ? '上传中…' : snapped ? '重拍' : '拍照'}
              </button>
              <button
                disabled={photoBusy}
                onClick={async () => {
                  const f = await captureNativePhoto('gallery');
                  if (f) void uploadAndComplete(f);
                  else if (f === undefined) galleryRef.current?.click();
                }}
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
          reminder.challenge.enabled && (
            <div className="mt-6 w-full shrink-0">
              <p className="rounded-full bg-accent-500/20 px-4 py-2 text-center text-sm text-accent-300">
                📸 拍照打卡挑战：完成后自动记录
              </p>
              <button
                onClick={() => {
                  setPhotoMode('challenge');
                  setShowCamera(true);
                }}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-card bg-accent-500 py-3.5 text-base font-semibold text-white transition-colors hover:bg-accent-700"
              >
                <Camera size={20} /> 开始拍照打卡
              </button>
            </div>
          )
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
                className="flex flex-1 items-center justify-center gap-1 rounded-card bg-danger-500/20 py-3.5 text-base text-danger-300 transition-colors hover:bg-danger-500/30"
              >
                <X size={18} /> 放弃
              </button>
            </div>
            {/* 2026-09-06：非挑战提醒也提供随手拍照记录（photo 日志，不影响完成状态） */}
            {!reminder.challenge.enabled && !showCamera && (
              <button
                disabled={busy}
                onClick={() => {
                  setPhotoMode('log');
                  setShowCamera(true);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-card bg-white/5 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/15"
              >
                <Camera size={16} /> 拍照记录（可选）
              </button>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
