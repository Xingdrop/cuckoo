/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3BhZ2VzL0ZhbWlseUNoYXRQYWdlLnRzeHwyMDI2LTA5fDUyMWQyYTAwYjQ= */
import { ChevronLeft, ImagePlus, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorBanner } from '../components/ui/Feedback';
import { familyApi, type ChatMessageItem, type FamilyPeer } from '../services/api/api.family';
import { filesApi } from '../services/api/api.files';
import { errorMessage } from '../services/http';
import { RImg } from '../components/remoteMedia';
import { compressMediaFile } from '../utils/media';
import { useAuthStore } from '../stores/authStore';

const POLL_MS = 5000;

/** 亲友聊天（简易图文轮询版；仅在线账户可用） */
export function FamilyChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const [items, setItems] = useState<ChatMessageItem[]>([]);
  const [peer, setPeer] = useState<FamilyPeer | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cursorRef = useRef<string | null>(null); // 增量游标：最后一条消息时间
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  };

  /** 全量加载 + 启动轮询（after 游标增量拉取） */
  const load = useCallback(
    async (incremental: boolean) => {
      if (!id) return;
      try {
        const res = await familyApi.messages(id, incremental ? (cursorRef.current ?? undefined) : undefined);
        setPeer(res.partner);
        setError(null);
        if (incremental) {
          if (res.items.length > 0) {
            setItems((prev) => {
              const known = new Set(prev.map((m) => m.id));
              const merged = [...prev, ...res.items.filter((m) => !known.has(m.id))];
              cursorRef.current = merged[merged.length - 1]?.createdAt ?? cursorRef.current;
              return merged;
            });
            scrollToBottom();
          }
        } else {
          setItems(res.items);
          cursorRef.current = res.items[res.items.length - 1]?.createdAt ?? null;
          scrollToBottom();
        }
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [id],
  );

  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => void load(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const send = async () => {
    const content = input.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      const msg = await familyApi.send(id!, { content });
      setInput('');
      setItems((prev) => [...prev, msg]);
      cursorRef.current = msg.createdAt;
      scrollToBottom();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** 附图发送（压缩 → 上传 → 图片消息） */
  const pickPhoto = async (file: File | null) => {
    if (!file || !id) return;
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressMediaFile(file);
      const uploaded = await filesApi.upload(compressed);
      const msg = await familyApi.send(id, { photoUrl: uploaded.url });
      setItems((prev) => [...prev, msg]);
      cursorRef.current = msg.createdAt;
      scrollToBottom();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-bg px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center text-ink-700"
          aria-label="返回"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="min-w-0 truncate text-lg font-semibold">与 {peer?.username ?? '…'} 聊天</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-3">
        <ErrorBanner message={error} />
        {items.length === 0 && !error ? (
          <p className="py-10 text-center text-sm text-ink-400">
            打个招呼吧～ 聊天内容仅你们两人可见
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((m) => (
              <li key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-card px-3 py-2 text-sm shadow-sm ${
                    m.mine ? 'bg-primary-500 text-white' : 'bg-surface text-ink-800'
                  }`}
                >
                  {m.photoUrl && (
                    <RImg
                      src={m.photoUrl}
                      alt="图片消息"
                      className="mb-1 max-h-52 w-auto rounded-lg object-cover"
                    />
                  )}
                  {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                  <p className={`mt-0.5 text-right text-[10px] ${m.mine ? 'text-white/70' : 'text-ink-400'}`}>
                    {fmtTime(m.createdAt)}
                    {m.mine && m.senderId === me?.id ? '' : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="sticky bottom-0 border-t border-ink-100 bg-bg px-3 py-2">
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pickPhoto(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600 disabled:opacity-50"
            aria-label="发送图片"
          >
            <ImagePlus size={18} />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={uploading ? '图片上传中…' : '输入消息…'}
            rows={1}
            maxLength={500}
            className="max-h-24 min-h-11 flex-1 resize-none rounded-btn border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-500"
          />
          <button
            onClick={() => void send()}
            disabled={busy || uploading || input.trim().length === 0}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white disabled:opacity-40"
            aria-label="发送"
          >
            <Send size={17} />
          </button>
        </div>
      </footer>
    </div>
  );
}
