/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8c3JjL2NvbXBvbmVudHMvUmVtaW5kZXJEZXRhaWxNb2RhbC50c3h8MjAyNi0wOXw1Njk0OGZjOWZk */
import { Camera, CheckCircle2, ChevronRight, FileText, Link as LinkIcon, Repeat, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { remindersApi } from '../services/api/api.reminders';
import { absoluteUrl } from '../services/http';
import type { CalendarItem, ReminderLogStatus } from '../types';
import { MediaCarousel } from './MediaCarousel';

/** 当日日志精简视图（云端 ReminderLog 与本地 GuestLog 字段并集的安全子集） */
interface DayLog {
  id: string;
  scheduledTime: string;
  status: ReminderLogStatus;
  photoUrl?: string | null;
  /** 2026-09-06：随手记文字 */
  note?: string | null;
  /** #8：累计延迟分钟（原时刻 + N = 新触发时刻） */
  delayMinutes?: number;
  actualTime?: string | null;
}

/** #8：延迟中的槽位新时间（原时刻 + 累计延迟分钟，跨小时进位） */
function delayedTime(time: string, delayMinutes?: number): string | null {
  if (!delayMinutes) return null;
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + delayMinutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const CATEGORY_EMOJI: Record<string, string> = {
  water: '💧',
  medication: '💊',
  exercise: '🏃',
  eye: '👀',
  posture: '🧘',
  rest: '😴',
  work: '💼',
  custom: '📌',
};

/** 时点状态徽标文案与配色（completed/challenge_completed 归一为已完成） */
const STATUS_CHIP: Record<string, { text: string; cls: string }> = {
  completed: { text: '已完成', cls: 'bg-primary-500/15 text-primary-700' },
  challenge_completed: { text: '已完成', cls: 'bg-primary-500/15 text-primary-700' },
  photo: { text: '已拍照', cls: 'bg-accent-100 text-accent-700' },
  delayed: { text: '已延迟', cls: 'bg-warning-500/15 text-warning-700' },
  skipped: { text: '已跳过', cls: 'bg-ink-100 text-ink-500' },
  missed: { text: '已错过', cls: 'bg-danger-500/15 text-danger-700' },
  manual: { text: '已补记', cls: 'bg-primary-500/15 text-primary-700' },
};

const statusChip = (s: ReminderLogStatus | null) =>
  (s && STATUS_CHIP[s]) || { text: '待完成', cls: 'bg-primary-50 text-primary-600' };

/** 重复规则人话描述 */
function repeatText(item: CalendarItem): string {
  const r = item.repeatRule;
  if (item.untimed) return '每日不定时';
  if (!r || r.type === 'once') return '单次提醒';
  if (r.type === 'daily') return '每天';
  if (r.type === 'weekly' && r.daysOfWeek?.length) {
    const names = ['日', '一', '二', '三', '四', '五', '六'];
    return `每周${r.daysOfWeek.map((d) => names[d]).join('、')}`;
  }
  if (r.type === 'monthly') return r.dayOfMonth ? `每月 ${r.dayOfMonth} 日` : '每月';
  if (r.type === 'interval' && r.intervalValue) {
    const unit = r.intervalUnit === 'hour' ? '小时' : r.intervalUnit === 'week' ? '周' : '天';
    return `每 ${r.intervalValue} ${unit}`;
  }
  return '重复提醒';
}

/**
 * 提醒详情浮窗（#26 扩展）：画面中央小窗展示——
 * 内容（文字/多图滑动/视频/外链）+ 今日时点逐项状态（不定时/间隔提醒含各小提醒）
 * + 当日拍照记录（含提醒后补拍）+ 行内操作（标记完成 / 补拍 / 错过确认修改由外层二次确认）。
 */
export function ReminderDetailModal({
  item,
  date,
  onClose,
  onComplete,
  onRetake,
}: {
  item: CalendarItem;
  /** 本地日期 key（yyyy-MM-dd），用于筛选当日日志 */
  date: string;
  onClose: () => void;
  /** 标记完成（time 缺省 = 不定时/当前待办时点；错过时点由外层弹确认） */
  onComplete: (time?: string) => void;
  /** 补拍照片（外层拉起相机/相册） */
  onRetake: () => void;
}) {
  const [logs, setLogs] = useState<DayLog[] | null>(null);
  const c = item.content ?? {};

  /** 当日日志（照片记录 + 时点状态兜底；本地/云端双路径已在 api 层适配） */
  useEffect(() => {
    let alive = true;
    remindersApi
      .logs(item.reminderId)
      .then((p) => {
        if (!alive) return;
        const dayLogs = p.items
          .map((l) => ({
            id: l.id,
            scheduledTime: l.scheduledTime,
            status: l.status as ReminderLogStatus,
            photoUrl: (l as { photoUrl?: string | null }).photoUrl ?? null,
            note: (l as { note?: string | null }).note ?? null,
            delayMinutes: (l as { delayMinutes?: number }).delayMinutes ?? 0,
            actualTime: (l as { actualTime?: string | null }).actualTime ?? null,
          }))
          .filter((l) => {
            const d = new Date(l.scheduledTime);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return key === date;
          });
        setLogs(dayLogs);
      })
      .catch(() => alive && setLogs([]));
    return () => {
      alive = false;
    };
  }, [item.reminderId, date]);

  /** 当日拍照记录（photo 或带 photoUrl 的完成/挑战记录） */
  const photoLogs = useMemo(
    () => (logs ?? []).filter((l) => l.photoUrl).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)),
    [logs],
  );

  const slots = item.untimed ? [] : item.times;
  /** 待完成时点（无状态记录）——「标记完成」优先作用于它 */
  const pendingSlot = slots.find((s) => !s.status);
  const missedSlots = slots.filter((s) => s.status === 'missed');

  const mediaUrls = useMemo(() => {
    const imgs = (c.imageUrls ?? []).map((u) => u);
    return c.videoUrl ? [...imgs, c.videoUrl] : imgs;
  }, [c.imageUrls, c.videoUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-5" onClick={onClose}>
      <div
        className="max-h-[82dvh] w-full max-w-sm overflow-y-auto rounded-card bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部：图标 + 标题 + 重复规则 */}
        <div className="sticky top-0 z-10 flex items-start gap-2.5 rounded-t-card bg-surface px-4 pb-2.5 pt-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-primary-50 text-lg">
            {item.categoryIcon ?? CATEGORY_EMOJI[item.category] ?? '📌'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{item.title}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-500">
              {(item.repeatRule || item.untimed) && (
                <>
                  <Repeat size={11} className="shrink-0" />
                  {repeatText(item)}
                  {slots.length > 0 && ' · '}
                </>
              )}
              {slots.length > 0 && `今日 ${slots.length} 次`}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭详情"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-3.5 px-4 pb-4">
          {/* 今日时点（不定时提醒 = 单行状态；间隔/多时段 = 逐行小提醒） */}
          <section>
            {item.untimed ? (
              <SlotRow
                label="今日（不定时）"
                status={logs?.find((l) => l.status === 'completed' || l.status === 'challenge_completed')
                  ? 'completed'
                  : (logs?.find((l) => l.status)?.status ?? null)}
                onDone={() => onComplete()}
                doneText="标记完成"
              />
            ) : slots.length === 1 ? (
              <SlotRow
                label={`${slots[0].time}`}
                status={slots[0].status}
                onDone={() => onComplete(slots[0].time)}
                doneText={slots[0].status === 'missed' ? '修改为已完成' : '标记完成'}
              />
            ) : (
              <ul className="divide-y divide-ink-100 overflow-hidden rounded-card bg-bg">
                {slots.map((s) => {
                  const chip = statusChip(s.status);
                  return (
                    <li key={s.time} className="flex items-center gap-2 px-3 py-2.5">
                      <span className="w-12 shrink-0 font-mono text-sm text-ink-700">
                        {s.time}
                        {s.delayMinutes ? (
                          <span className="block font-sans text-[9px] text-warning-700">
                            → {delayedTime(s.time, s.delayMinutes)}
                          </span>
                        ) : null}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${chip.cls}`}>
                        {chip.text}
                      </span>
                      <span className="min-w-0 flex-1" />
                      {!s.status && (
                        <button
                          onClick={() => onComplete(s.time)}
                          className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-primary-500 px-2.5 text-[11px] font-medium text-white"
                        >
                          <CheckCircle2 size={12} /> 完成
                        </button>
                      )}
                      {s.status === 'missed' && (
                        <button
                          onClick={() => onComplete(s.time)}
                          className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-primary-50 px-2.5 text-[11px] font-medium text-primary-700"
                        >
                          <CheckCircle2 size={12} /> 补记
                        </button>
                      )}
                      {!s.status && (
                        <button
                          onClick={onRetake}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600"
                          aria-label="补拍照片"
                        >
                          <Camera size={13} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* 内容：文字说明 */}
          {c.text && (
            <p className="whitespace-pre-wrap rounded-card bg-bg px-3.5 py-3 text-sm leading-relaxed text-ink-700">
              <FileText size={13} className="mr-1.5 inline -translate-y-0.5 text-ink-400" />
              {c.text}
            </p>
          )}

          {/* 内容：多图/视频（滑动查看） */}
          {mediaUrls.length > 0 && <MediaCarousel urls={mediaUrls} />}

          {/* 内容：外链 */}
          {c.linkUrl && (
            <a
              href={c.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-card bg-primary-50 px-3.5 py-3 text-sm text-primary-700"
            >
              <LinkIcon size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{c.linkUrl}</span>
              <ChevronRight size={14} className="shrink-0" />
            </a>
          )}

          {/* 当日拍照记录（提醒后补拍的照片） */}
          {(photoLogs.length > 0 || logs === null) && (
            <section>
              <p className="text-xs font-medium text-ink-500">📷 当日拍照记录（{photoLogs.length}）</p>
              {logs === null ? (
                <p className="mt-2 text-xs text-ink-400">加载中…</p>
              ) : photoLogs.length === 0 ? (
                <p className="mt-1.5 text-xs text-ink-400">这一天还没有拍照记录，点下方「补拍照片」添加</p>
              ) : (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                  {photoLogs.map((l) => (
                    <figure key={l.id} className="w-24 shrink-0">
                      <img
                        src={absoluteUrl(l.photoUrl!)}
                        alt="拍照记录"
                        loading="lazy"
                        className="aspect-square w-full rounded-btn object-cover"
                      />
                      <figcaption className="mt-1 text-center text-[10px] text-ink-400">
                        {new Date(l.scheduledTime).toTimeString().slice(0, 5)}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* #4/#8：当日文字记录（随手记）+ 延迟轨迹 */}
          {(logs ?? []).some((l) => l.note) && (
            <section>
              <p className="text-xs font-medium text-ink-500">📝 当日记录</p>
              <ul className="mt-2 space-y-1.5">
                {(logs ?? [])
                  .filter((l) => l.note)
                  .map((l) => {
                    const d = new Date(l.scheduledTime);
                    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    const nt = l.actualTime ? new Date(l.actualTime) : null;
                    const ntStr = nt ? `${String(nt.getHours()).padStart(2, '0')}:${String(nt.getMinutes()).padStart(2, '0')}` : null;
                    return (
                      <li key={l.id} className="rounded-card bg-bg px-3 py-2">
                        <p className="text-[11px] text-ink-400">
                          {hhmm}
                          {l.delayMinutes ? ` → 延迟 ${l.delayMinutes} 分钟${ntStr ? `（${ntStr} 操作）` : ''}` : ''}
                          {ntStr && !l.delayMinutes ? ` · ${ntStr} ` : ''}
                          {' · '}
                          {STATUS_CHIP[l.status]?.text ?? l.status}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-700">{l.note}</p>
                      </li>
                    );
                  })}
              </ul>
            </section>
          )}

          {!c.text && mediaUrls.length === 0 && !c.linkUrl && (
            <p className="text-xs text-ink-400">该提醒未附加内容说明</p>
          )}

          {/* 底部操作 */}
          <div className="flex gap-2.5 pt-1">
            <button
              onClick={onRetake}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-btn bg-ink-100 text-sm font-medium text-ink-700"
            >
              <Camera size={15} /> 补拍照片
            </button>
            {pendingSlot || item.untimed || missedSlots.length > 0 ? (
              <button
                onClick={() => onComplete(item.untimed ? undefined : (pendingSlot?.time ?? missedSlots[0]?.time))}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-btn bg-primary-500 text-sm font-medium text-white"
              >
                <CheckCircle2 size={15} /> {missedSlots.length > 0 && !pendingSlot ? '修改为已完成' : '标记完成'}
              </button>
            ) : (
              <span className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-btn bg-primary-50 text-sm font-medium text-primary-600">
                <CheckCircle2 size={15} /> 今日已完成
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 单时点行（单时段/不定时提醒） */
function SlotRow({
  label,
  status,
  onDone,
  doneText,
}: {
  label: string;
  status: ReminderLogStatus | null;
  onDone: () => void;
  doneText: string;
}) {
  const chip = statusChip(status);
  return (
    <div className="flex items-center gap-2 rounded-card bg-bg px-3 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm text-ink-700">{label}</span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${chip.cls}`}>{chip.text}</span>
      {!status && (
        <button
          onClick={onDone}
          className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-primary-500 px-2.5 text-[11px] font-medium text-white"
        >
          <CheckCircle2 size={12} /> {doneText}
        </button>
      )}
      {status === 'missed' && (
        <button
          onClick={onDone}
          className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-primary-50 px-2.5 text-[11px] font-medium text-primary-700"
        >
          <CheckCircle2 size={12} /> 补记
        </button>
      )}
    </div>
  );
}
