/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL2NvbXBvbmVudHMvTWVkaWFHcmlkLnRzeHwyMDI2LTA5fGIzOTYzMmVmZmM= */
import { Play, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { RImg, RVideo } from './remoteMedia';

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

/**
 * 视频卡：封面（首帧）+ 时长角标 + 播放/暂停浮层
 * 2026-09-17 修复「视频不显示封面」：
 *  ① 容器原固定 aspect-video(16:9) + object-cover，竖屏视频只剩中间一条（被放大成抽象色块）
 *     → 改为读取视频真实宽高比撑开容器（极高视频限高 460px 并轻微裁切）；
 *  ② 部分 WebView 在 preload=metadata 下不绘制首帧（黑块）→ 元数据就绪后轻推时间轴触发解码。
 */
function VideoTile({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<string>('');
  const [ratio, setRatio] = useState<number | null>(null);

  return (
    <div
      className="relative w-full overflow-hidden bg-black"
      style={{ aspectRatio: ratio ? String(ratio) : '16 / 9', maxHeight: 460 }}
    >
      <RVideo
        ref={ref}
        src={url}
        controls={playing}
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (Number.isFinite(v.duration)) setDuration(fmtDuration(v.duration));
          if (v.videoWidth > 0 && v.videoHeight > 0) setRatio(v.videoWidth / v.videoHeight);
          // 首帧兜底：短暂 seek 触发解码绘制
          if (v.currentTime === 0) {
            try {
              v.currentTime = 0.1;
            } catch {
              /* 个别 WebView 不允许 seek：忽略，等用户点播放 */
            }
          }
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
              <RImg src={m.url} alt="帖子媒体" loading="lazy" className="aspect-video w-full object-cover" />
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
            <RImg
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
