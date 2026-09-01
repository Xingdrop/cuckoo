import { Play, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { absoluteUrl } from '../services/http';

/** 判断 URL 是否为视频（#8：帖子支持视频播放） */
export function isVideoUrl(u: string): boolean {
  return /\.(mp4|webm)(\?|$)/i.test(u);
}

interface MediaItem {
  url: string;
  type: 'image' | 'video';
}

function toItems(urls: string[]): MediaItem[] {
  return urls.map((u) => ({ url: u, type: isVideoUrl(u) ? ('video' as const) : ('image' as const) }));
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 视频卡：封面（首帧）+ 时长角标 + 播放/暂停浮层 */
function VideoTile({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<string>('');

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      <video
        ref={ref}
        src={absoluteUrl(url)}
        controls={playing}
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(fmtDuration(d));
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      {!playing && (
        <button
          className="absolute inset-0 flex items-center justify-center bg-black/20"
          onClick={() => {
            void ref.current?.play();
          }}
          aria-label="播放视频"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-primary-600 shadow">
            <Play size={22} fill="currentColor" />
          </span>
        </button>
      )}
      {duration && (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {duration}
        </span>
      )}
    </div>
  );
}

/**
 * 帖子媒体网格（#8）：图片/视频混合渲染 + 点击全屏大图预览（左右切换）。
 * 防遮挡：容器 overflow-hidden + 媒体固定宽高比。
 */
export function MediaGrid({ urls, className = '' }: { urls: string[]; className?: string }) {
  const items = useMemo(() => toItems(urls.slice(0, 4)), [urls]);
  const [preview, setPreview] = useState<number | null>(null);

  if (items.length === 0) return null;

  return (
    <>
      <div
        className={`overflow-hidden rounded-btn ${className} ${
          items.length === 1 ? '' : 'grid grid-cols-2 gap-1'
        }`}
      >
        {items.map((m, i) =>
          m.type === 'video' ? (
            <VideoTile key={m.url} url={m.url} />
          ) : (
            <button key={m.url} className="block w-full" onClick={() => setPreview(i)} aria-label="查看大图">
              <img src={absoluteUrl(m.url)} alt="帖子媒体" loading="lazy" className="aspect-video w-full object-cover" />
            </button>
          ),
        )}
      </div>

      {/* 全屏大图预览（点击左右切换） */}
      {preview !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
          onClick={() => setPreview(null)}
        >
          <button
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white"
            aria-label="关闭预览"
          >
            <X size={20} />
          </button>
          {items[preview] && (
            <img
              src={absoluteUrl(items[preview].url)}
              alt="大图预览"
              className="max-h-[80dvh] max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          {items.length > 1 && (
            <button
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/20 px-3 py-2 text-xl text-white"
              onClick={(e) => {
                e.stopPropagation();
                setPreview((preview - 1 + items.length) % items.length);
              }}
            >
              ‹
            </button>
          )}
          {items.length > 1 && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/20 px-3 py-2 text-xl text-white"
              onClick={(e) => {
                e.stopPropagation();
                setPreview((preview + 1) % items.length);
              }}
            >
              ›
            </button>
          )}
        </div>
      )}
    </>
  );
}
