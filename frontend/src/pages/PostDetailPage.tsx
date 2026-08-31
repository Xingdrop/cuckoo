import { ChevronLeft, Heart, MessageCircle, Pencil, Send, Star, Trash2, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ConfirmModal } from '../components/ConfirmModal';
import { MediaGrid } from '../components/MediaGrid';
import { LinkedText } from '../components/LinkedText';
import { PullToRefresh } from '../components/PullToRefresh';
import { profileApi } from '../services/api/api.plans';
import { errorMessage } from '../services/http';
import { useAuthStore } from '../stores/authStore';
import { useConnectionStore } from '../stores/connectionStore';
import { socialApi, Post } from '../services/api/api.social';

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author?: { id: string; username: string };
}

/**
 * P-12 帖子详情（评论/点赞/收藏/加入计划）
 */
export function PostDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const online = useConnectionStore((s) => s.online);
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [following, setFollowing] = useState(false);

  // #5：作者关注状态（非本人）
  useEffect(() => {
    if (!post || post.author.id === me?.id) return;
    profileApi
      .get(post.author.id)
      .then((p) => setFollowing(p.isFollowing))
      .catch(() => undefined);
  }, [post, me?.id]);

  const toggleFollowAuthor = async () => {
    if (!post) return;
    try {
      const r = await profileApi.follow(post.author.id);
      setFollowing(r.following);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const load = useCallback(async () => {
    if (!id) return;
    try {
      // #17：离线时评论为空（缓存只读；评论列表不落缓存）
      const [p, c] = await Promise.all([
        socialApi.getPost(id),
        socialApi.comments(id).catch(() => ({ items: [], total: 0, page: 1, pageSize: 20 })),
      ]);
      setPost(p);
      setComments(c.items);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitComment = async () => {
    if (!id || !commentText.trim()) return;
    try {
      await socialApi.comment(id, commentText.trim());
      setCommentText('');
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  /** 加入/退出计划：乐观更新 + loading（#1：修复"无法退出/点击无反应"；#22：游客禁社群计划） */
  const toggleJoin = async () => {
    if (!post || joining) return;
    setJoining(true);
    setError(null);
    const nextJoined = !post.myJoined;
    setPost({ ...post, myJoined: nextJoined, joinedCount: post.joinedCount + (nextJoined ? 1 : -1) });
    try {
      if (nextJoined) {
        await socialApi.join(post.id);
      } else {
        await socialApi.leave(post.id);
      }
      void load();
    } catch (e) {
      setPost({ ...post, myJoined: !nextJoined, joinedCount: post.joinedCount });
      setError(errorMessage(e));
    } finally {
      setJoining(false);
    }
  };

  const saveEdit = async () => {
    if (!post || !editText.trim()) return;
    try {
      await socialApi.updatePost(post.id, editText.trim());
      setEditing(false);
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const removePost = async () => {
    if (!post) return;
    try {
      await socialApi.removePost(post.id);
      navigate(-1);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-ink-500">加载中…</div>;
  }

  return (
    <div className="mx-auto max-w-md pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-bg/95 px-4 py-3 backdrop-blur">
        <button
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center text-ink-700"
          aria-label="返回"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="flex-1 text-lg font-semibold">帖子详情</h1>
      </header>

      <PullToRefresh onRefresh={async () => { await load(); }}>
      <main className="px-4 pt-3">
        {!online && (
          <p className="mb-3 rounded-btn bg-warning-500/15 px-3 py-2 text-[11px] text-ink-700">
            📡 离线浏览（断网前缓存）：评论区不可见，点赞/评论/收藏/加入等需联网后使用
          </p>
        )}
        {error && (
          <p className="mb-3 rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{error}</p>
        )}
        {post && (
          <div className="rounded-card bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => navigate(`/profile/${post.author.id}`)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-sm font-medium text-primary-600"
                aria-label={`查看 @${post.author.username} 的主页`}
              >
                {post.author.username.slice(0, 1).toUpperCase()}
              </button>
              <button
                onClick={() => navigate(`/profile/${post.author.id}`)}
                className="text-sm font-medium"
              >
                @{post.author.username}
              </button>
              {post.author.id !== me?.id && (
                <button
                  onClick={() => void toggleFollowAuthor()}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${
                    following ? 'bg-ink-100 text-ink-500' : 'bg-primary-500 text-white'
                  }`}
                >
                  {following ? '已关注' : '+ 关注'}
                </button>
              )}
              <span className="ml-auto text-[10px] text-ink-300">
                {new Date(post.createdAt).toLocaleString('zh-CN', { hour12: false }).slice(0, 16)}
                {post.updatedAt &&
                new Date(post.updatedAt).getTime() - new Date(post.createdAt).getTime() > 60_000
                  ? ' · 已编辑'
                  : ''}
              </span>
            </div>

            {editing ? (
              <div className="mt-3">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  className="w-full resize-none rounded-btn border border-ink-100 p-3 text-sm outline-none focus:border-primary-400"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="flex-1 rounded-btn bg-ink-100 py-2.5 text-xs font-medium text-ink-700"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => void saveEdit()}
                    disabled={!editText.trim()}
                    className="flex-1 rounded-btn bg-primary-500 py-2.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    保存修改
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-relaxed">
                <LinkedText text={post.content} />
              </p>
            )}

            {/* 帖子媒体（#8：多图大图预览 + 视频播放） */}
            {post.mediaUrls.length > 0 && <MediaGrid urls={post.mediaUrls} className="mt-3" />}

            {post.planSnapshot && (
              <div className="mt-3 rounded-btn bg-primary-50/60 px-3.5 py-2.5">
                {/* #2：显示计划名 + 点击查看计划详情 */}
                <button
                  onClick={() => navigate(`/posts/${post.id}/plan`)}
                  className="flex w-full items-center gap-1.5 text-left"
                >
                  <span className="text-xs font-medium text-primary-700">📋</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary-700">
                    {(post.planSnapshot as { from?: { name?: string } } | null)?.from?.name || '分享的计划'}
                  </span>
                  <span className="shrink-0 text-[10px] text-primary-500">查看详情 ›</span>
                </button>
                <button
                  onClick={() => void toggleJoin()}
                  disabled={joining}
                  className={`mt-2 w-full rounded-full py-1.5 text-xs font-medium disabled:opacity-50 ${
                    post.myJoined ? 'bg-ink-100 text-ink-700' : 'bg-primary-500 text-white'
                  }`}
                >
                  {joining ? '处理中…' : post.myJoined ? '✓ 已加入（点击退出）' : '一键加入'}
                </button>
              </div>
            )}

            {/* 自己帖子：编辑/删除（#10） */}
            {post.userId === me?.id && !editing && (
              <div className="mt-2 flex items-center justify-end gap-3 text-xs">
                <button
                  onClick={() => {
                    setEditText(post.content);
                    setEditing(true);
                  }}
                  className="flex items-center gap-1 text-ink-500"
                >
                  <Pencil size={13} /> 编辑
                </button>
                <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1 text-danger-500">
                  <Trash2 size={13} /> 删除
                </button>
              </div>
            )}

            <div className="mt-3 flex items-center gap-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
              <button
                onClick={async () => {
                  await socialApi.like(post.id);
                  void load();
                }}
                className={`flex items-center gap-1 ${post.myLiked ? 'text-danger-500' : ''}`}
              >
                <Heart size={15} fill={post.myLiked ? 'currentColor' : 'none'} /> {post.likesCount}
              </button>
              <span className="flex items-center gap-1">
                <MessageCircle size={15} /> {post.commentsCount}
              </span>
              <button
                onClick={async () => {
                  await socialApi.favorite(post.id);
                  void load();
                }}
                className={`flex items-center gap-1 ${post.myFavorited ? 'text-accent-700' : ''}`}
              >
                <Star size={15} fill={post.myFavorited ? 'currentColor' : 'none'} /> 收藏
              </button>
              <span className="ml-auto flex items-center gap-1 text-primary-600">
                <Users size={14} /> {post.joinedCount} 人已加入
              </span>
            </div>
          </div>
        )}

        {/* 评论列表 */}
        <h2 className="mt-5 px-1 text-sm font-medium">评论（{comments.length}）</h2>
        <ul className="mt-2 space-y-2">
          {comments.length === 0 && (
            <p className="rounded-card bg-surface p-6 text-center text-xs text-ink-300 shadow-sm">
              还没有评论，来说两句吧
            </p>
          )}
          {comments.map((c) => (
            <li key={c.id} className="rounded-card bg-surface px-4 py-3 shadow-sm">
              <p className="text-[11px] text-primary-600">@{c.author?.username ?? '用户'}</p>
              <p className="mt-0.5 text-sm leading-relaxed">{c.content}</p>
              <p className="mt-1 text-[10px] text-ink-300">
                {new Date(c.createdAt).toLocaleString('zh-CN', { hour12: false }).slice(0, 16)}
              </p>
            </li>
          ))}
        </ul>
      </main>
      </PullToRefresh>

      {/* 删除确认（#7） */}
      <ConfirmModal
        open={confirmDelete}
        title="删除帖子"
        message="确定删除这条帖子吗？删除后不可恢复。"
        confirmText="确认删除"
        cancelText="取消"
        onConfirm={() => void removePost()}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* 评论输入栏 */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-md items-center gap-2">
          <input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitComment();
            }}
            readOnly={!online}
            maxLength={500}
            placeholder={online ? '写下你的评论…' : '当前离线，评论需联网'}
            className="flex-1 rounded-full border border-ink-100 px-4 py-2.5 text-sm outline-none focus:border-primary-400 disabled:bg-ink-100/50"
          />
          <button
            onClick={() => void submitComment()}
            disabled={!commentText.trim() || !online}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-white disabled:opacity-40"
            aria-label="发送评论"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
