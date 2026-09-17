/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL2NvbXBvbmVudHMvUG9zdENhcmQudHN4fDIwMjYtMDl8OTRhNmM3NTU2Yg== */
/**
 * 帖子卡片（2026-09-17 抽出）：广场 / 关注 / 我的 三个 tab 共用同一套展示，
 * 避免「关注流显示不全、样式与广场不一致」。
 */
import { Heart, MessageCircle, Star, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Post } from '../services/api/api.social';
import { MediaGrid } from './MediaGrid';
import { RImg } from './remoteMedia';
import { LinkedText } from './LinkedText';

/** 相对时间：未来/跨天显示月日+时刻，#5 修复"分钟前"错显示 */
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 0) return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 「已编辑」角标：updatedAt 明显晚于 createdAt 才显示 */
const edited = (post: Post) =>
  Boolean(
    post.updatedAt && new Date(post.updatedAt).getTime() - new Date(post.createdAt).getTime() > 60_000,
  );

export interface PostCardProps {
  post: Post;
  /** 当前登录用户 id（自己发的帖不显示关注按钮） */
  meId?: string;
  /** 是否已关注作者 */
  following: boolean;
  /** 该帖「一键加入」是否处理中 */
  joining?: boolean;
  onFollow: (authorId: string) => void;
  onLike: (post: Post) => void;
  onFavorite: (post: Post) => void;
  onJoin: (post: Post) => void;
}

/**
 * 帖子卡片（2026-09-17 抽出）：广场 / 关注 / 我的 三个 tab 共用同一套展示，
 * 避免「关注流显示不全、样式与广场不一致」。
 */
export function PostCard({
  post,
  meId,
  following,
  joining = false,
  onFollow,
  onLike,
  onFavorite,
  onJoin,
}: PostCardProps) {
  const navigate = useNavigate();
  const openPost = () => navigate(`/posts/${post.id}`);

  return (
    <li onClick={openPost} className="cursor-pointer rounded-card bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/profile/${post.author.id}`);
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-sm font-semibold text-primary-600"
          aria-label={`查看 @${post.author.username} 的主页`}
        >
          {post.author.avatarUrl ? (
            <RImg src={post.author.avatarUrl} alt="头像" className="h-full w-full object-cover" />
          ) : (
            post.author.username.slice(0, 1).toUpperCase()
          )}
        </button>
        <div className="min-w-0 flex-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/profile/${post.author.id}`);
            }}
            className="block max-w-full truncate text-sm font-medium"
          >
            @{post.author.username}
          </button>
          <p className="text-[10px] text-ink-300">
            {fmtTime(post.createdAt)}
            {edited(post) ? ' · 已编辑' : ''}
          </p>
        </div>
        {post.author.id !== meId && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFollow(post.author.id);
            }}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${
              following ? 'bg-ink-100 text-ink-500' : 'bg-primary-500 text-white'
            }`}
          >
            {following ? '已关注' : '+ 关注'}
          </button>
        )}
        {post.type === 'official_plan' && (
          <span className="shrink-0 rounded-full bg-accent-100 px-2 py-0.5 text-[10px] text-accent-700">
            官方
          </span>
        )}
      </div>

      <p className="mt-3 text-sm leading-relaxed">
        <LinkedText text={post.content} />
      </p>

      {/* 帖子媒体（图片/视频 + 全屏预览，#8） */}
      {post.mediaUrls.length > 0 && <MediaGrid urls={post.mediaUrls} className="mt-3" />}

      {post.planSnapshot && (
        <div className="mt-3 rounded-btn bg-primary-50/60 px-3 py-2">
          {/* #2/#26：紧凑展示计划引用——缩小字号与留白，不占大面积 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/posts/${post.id}/plan`);
            }}
            className="flex w-full items-center gap-1.5 text-left"
          >
            <span className="text-[11px] text-primary-700">📋</span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-primary-700">
              {(post.planSnapshot as { from?: { name?: string } } | null)?.from?.name || '分享的计划'}
            </span>
            <span className="shrink-0 text-[9px] text-primary-500">查看详情 ›</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onJoin(post);
            }}
            disabled={joining}
            className={`mt-1.5 w-full rounded-btn py-2 text-xs font-medium transition-colors ${
              post.myJoined ? 'bg-ink-100 text-ink-700' : 'bg-primary-500 text-white'
            }`}
          >
            {post.myJoined ? '✓ 已加入（点击退出）' : '一键加入计划'}
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center gap-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLike(post);
          }}
          className={`flex items-center gap-1 ${post.myLiked ? 'text-danger-500' : ''}`}
        >
          <Heart size={15} fill={post.myLiked ? 'currentColor' : 'none'} />
          {post.likesCount}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            openPost();
          }}
          className="flex items-center gap-1"
        >
          <MessageCircle size={15} /> {post.commentsCount}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFavorite(post);
          }}
          className={`flex items-center gap-1 ${post.myFavorited ? 'text-accent-700' : ''}`}
        >
          <Star size={15} fill={post.myFavorited ? 'currentColor' : 'none'} /> 收藏
        </button>
        <span className="ml-auto flex items-center gap-1 text-primary-600">
          <Users size={14} /> {post.joinedCount} 人已加入
        </span>
      </div>
    </li>
  );
}