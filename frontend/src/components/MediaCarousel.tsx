/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL2NvbXBvbmVudHMvTWVkaWFDYXJvdXNlbC50c3h8MjAyNi0wOXwzMWZiOGFhODIx */
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isVideoUrl } from './MediaGrid';
import { RImg, RVideo } from './remoteMedia';

/**
 * 媒体横向轮播（提醒详情/官方计划跟练图）：scroll-snap 滑动切换 + 页码指示 + 点击全屏。
 * 相比 MediaGrid 的网格更适合"逐张跟练"的浏览方式（#26 详情浮窗）。
 */
export function MediaCarousel({
  urls,
  aspect = 'aspect-[4/3]',
  className = '',
}: {
  urls: string[];
  /** 单张媒体容器的宽高比类 */
  aspect?: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [idx, setIdx] = useState(0);
  const [viewer, setViewer] = useState(false);

  if (urls.length === 0) return null;

  const scrollTo = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(urls.length - 1, i));
    track.scrollTo({ left: clamped * track.clientWidth, behavior: 'smooth' });
  };

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setIdx(Math.round(track.scrollLeft / track.clientWidth));
  };

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-btn bg-bg">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {urls.map((u) =>
            isVideoUrl(u) ? (
              <RVideo
                key={u}
                src={u}
                controls
                playsInline
                preload="metadata"
                className={`${aspect} w-full shrink-0 snap-center bg-black object-contain`}
              />
            ) : (
              <button
                key={u}
                type="button"
                onClick={() => setViewer(true)}
                className={`${aspect} w-full shrink-0 snap-center`}
                aria-label="查看大图"
              >
                <RImg src={u} alt="媒体内容" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ),
          )}
        </div>
        {urls.length > 1 && (
          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
            {idx + 1}/{urls.length}
          </span>
        )}
      </div>

      {urls.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => scrollTo(idx - 1)}
            disabled={idx === 0}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-100 text-ink-600 disabled:opacity-30"
            aria-label="上一张"
          >
            <ChevronLeft size={14} />
          </button>
          <div className="flex gap-1.5">
            {urls.map((u, i) => (
              <span
                key={u}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? 'w-4 bg-primary-500' : 'w-1.5 bg-ink-200'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => scrollTo(idx + 1)}
            disabled={idx === urls.length - 1}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-100 text-ink-600 disabled:opacity-30"
            aria-label="下一张"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* 全屏滑动查看（复用同一轨道结构，带左右切换与关闭） */}
      {viewer && (
        <FullscreenViewer urls={urls.filter((u) => !isVideoUrl(u))} initial={0} onClose={() => setViewer(false)} />
      )}
    </div>
  );
}

/** 全屏图片查看器：滑动切换（scroll-snap）+ 点击关闭（触摸友好，替代左右小箭头） */
export function FullscreenViewer({
  urls,
  initial = 0,
  onClose,
}: {
  urls: string[];
  initial?: number;
  onClose: () => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [idx, setIdx] = useState(initial);

  useEffect(() => {
    const track = trackRef.current;
    if (track && initial > 0) track.scrollTo({ left: initial * track.clientWidth });
  }, [initial]);

  if (urls.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/95">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
        aria-label="关闭大图"
      >
        <X size={20} />
      </button>
      <div
        ref={trackRef}
        onScroll={(e) => {
          const t = e.currentTarget;
          if (t.clientWidth) setIdx(Math.round(t.scrollLeft / t.clientWidth));
        }}
        className="flex h-full snap-x snap-mandatory overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {urls.map((u) => (
          <div key={u} className="flex h-full w-full shrink-0 snap-center items-center justify-center p-4">
            <RImg src={u} alt="大图预览" className="max-h-full max-w-full object-contain" />
          </div>
        ))}
      </div>
      {urls.length > 1 && (
        <>
          <p className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs text-white">
            {idx + 1} / {urls.length} · 左右滑动切换
          </p>
          <button
            onClick={() => {
              const t = trackRef.current;
              if (t) t.scrollTo({ left: Math.max(0, idx - 1) * t.clientWidth, behavior: 'smooth' });
            }}
            className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white"
            aria-label="上一张"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => {
              const t = trackRef.current;
              if (t) t.scrollTo({ left: Math.min(urls.length - 1, idx + 1) * t.clientWidth, behavior: 'smooth' });
            }}
            className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white"
            aria-label="下一张"
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}
    </div>
  );
}

/** 视频提示角标（轮播内视频无法点击看大图，直接内嵌播放） */
export function VideoBadge() {
  return (
    <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
      <Play size={10} /> 视频
    </span>
  );
}
