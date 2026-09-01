import { ChevronRight, FileText, Link as LinkIcon, X } from 'lucide-react';
import { absoluteUrl } from '../services/http';
import type { CalendarItem } from '../types';

const CATEGORY_EMOJI: Record<string, string> = {
  water: '💧',
  medication: '💊',
  exercise: '🏃',
  eye: '👀',
  posture: '🧘',
  custom: '📌',
};

/**
 * #25：今日提醒「点击查看详情」——底部抽屉展示提醒的全部内容
 * （说明文字 / 图片 / 视频（带播放按钮）/ 外链）
 */
export function ReminderDetailSheet({
  item,
  onClose,
}: {
  item: CalendarItem;
  onClose: () => void;
}) {
  const c = item.content ?? {};
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-card bg-surface p-5 pb-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-base">
            {item.categoryIcon ?? CATEGORY_EMOJI[item.category] ?? '📌'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{item.title}</p>
            <p className="text-[11px] text-ink-500">
              {item.untimed ? '不定时' : item.times.length > 1 ? `每日 ${item.times.length} 个时点` : item.times[0]?.time}
              {!item.untimed && item.times.length > 1 ? `（${item.times.slice(0, 3).map((t) => t.time).join(' / ')}…）` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭详情"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600"
          >
            <X size={16} />
          </button>
        </div>

        {c.text && (
          <p className="mt-3 whitespace-pre-wrap rounded-btn bg-bg px-3.5 py-3 text-sm leading-relaxed text-ink-700">
            <FileText size={13} className="mr-1.5 inline -translate-y-0.5 text-ink-400" />
            {c.text}
          </p>
        )}

        {(c.imageUrls?.length ?? 0) > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {c.imageUrls!.map((u, i) => (
              <img
                key={u}
                src={absoluteUrl(u)}
                alt={`图片 ${i + 1}`}
                className="aspect-square w-full rounded-btn object-cover"
              />
            ))}
          </div>
        )}

        {c.videoUrl && (
          <div className="relative mt-3 overflow-hidden rounded-btn bg-black">
            <video src={absoluteUrl(c.videoUrl)} controls playsInline className="max-h-64 w-full" />
            <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
              ▶ 视频
            </span>
          </div>
        )}

        {c.linkUrl && (
          <a
            href={c.linkUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center gap-2 rounded-btn bg-primary-50 px-3.5 py-3 text-sm text-primary-700"
          >
            <LinkIcon size={14} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{c.linkUrl}</span>
            <ChevronRight size={14} className="shrink-0" />
          </a>
        )}

        {!c.text && (c.imageUrls?.length ?? 0) === 0 && !c.videoUrl && !c.linkUrl && (
          <p className="mt-3 text-xs text-ink-400">该提醒未附加内容说明</p>
        )}
      </div>
    </div>
  );
}
