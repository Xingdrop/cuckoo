import { X } from 'lucide-react';
import { useMemo, useState } from 'react';

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
            <video
              key={m.url}
              src={m.url}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full object-cover bg-black"
            />
          ) : (
            <button key={m.url} className="block w-full" onClick={() => setPreview(i)} aria-label="查看大图">
              <img src={m.url} alt="帖子媒体" loading="lazy" className="aspect-video w-full object-cover" />
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
              src={items[preview].url}
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
