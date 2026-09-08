// @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3BhZ2VzL3NvY2lhbC9GYW1pbHlUYWIudHN4fDIwMjYtMDl8Yjg3NmYxYjQyMA==
import { ChevronRight, HeartHandshake, MessageCircle, UserPlus, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../../components/ui/Feedback';
import type { FamilyBindingItem } from '../../services/api/api.family';
import { familyApi } from '../../services/api/api.family';
import { errorMessage } from '../../services/http';
import { RImg } from '../../components/remoteMedia';
import { useGuestStore } from '../../guest/guestStore';
import { useConnectionStore } from '../../stores/connectionStore';

/**
 * 社交页「亲友」tab：绑定列表（未读角标）→ 点击进入聊天；
 * 入口级操作（邀请码/审批管理）跳「个人主页 → 亲友与家人」。
 */
export function FamilyTab({
  family,
  onChanged,
}: {
  family: FamilyBindingItem[] | null;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const online = useConnectionStore((s) => s.online);
  const active = family?.filter((b) => b.status === 'active') ?? [];
  const pending = family?.filter((b) => b.status === 'pending' && b.iAmApprover) ?? [];

  const respond = async (b: FamilyBindingItem, approve: boolean) => {
    try {
      await (approve ? familyApi.approve(b.id) : familyApi.reject(b.id));
      onChanged();
    } catch (e) {
      alert(errorMessage(e));
    }
  };

  return (
    <div className="space-y-3">
      {/* 入口：管理（邀请码/联系人） */}
      <button
        onClick={() => navigate('/family')}
        className="flex w-full items-center gap-3 rounded-card bg-surface p-4 text-left shadow-sm"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <HeartHandshake size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">亲友与家人</span>
          <span className="mt-0.5 block text-xs text-ink-500">邀请码绑定 · 健康摘要 · 通知联系人管理</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-ink-300" />
      </button>

      {/* 待我审批 */}
      {pending.map((b) => (
        <div key={b.id} className="flex items-center gap-3 rounded-card bg-surface p-4 shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-600">
            {b.peer.username.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">@{b.peer.username}</span>
            <span className="block text-xs text-primary-600">请求与你绑定亲友</span>
          </span>
          <button onClick={() => void respond(b, true)} className="h-8 shrink-0 rounded-lg bg-primary-500 px-3 text-xs font-medium text-white">
            同意
          </button>
          <button onClick={() => void respond(b, false)} className="h-8 shrink-0 rounded-lg bg-ink-100 px-3 text-xs font-medium text-ink-600">
            拒绝
          </button>
        </div>
      ))}

      {/* 绑定列表：点击 → 聊天 */}
      {family === null ? (
        <div className="rounded-card bg-surface p-8 text-center text-sm text-ink-400 shadow-sm">加载中…</div>
      ) : active.length === 0 ? (
        <EmptyState icon={<Users size={34} />}>
          还没有绑定的亲友
          <p className="mt-1 text-xs text-ink-400">在「亲友与家人」生成邀请码，家人提交后即可互看健康摘要、聊天</p>
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {active.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => {
                  if (useGuestStore.getState().active || !useConnectionStore.getState().online) {
                    alert('亲友聊天需联网的正常账户使用');
                    return;
                  }
                  void online;
                  navigate(`/family/chat/${b.id}`);
                }}
                className="flex w-full items-center gap-3 rounded-card bg-surface p-4 text-left shadow-sm"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-sm font-semibold text-primary-600">
                  {b.peer.avatarUrl ? <RImg src={b.peer.avatarUrl} alt="" className="h-full w-full object-cover" /> : b.peer.username.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">@{b.peer.username}</span>
                  <span className="block text-xs text-ink-400">点击发消息 · 查看摘要请进「亲友与家人」</span>
                </span>
                {b.unread > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger-500 px-1.5 text-[10px] font-bold text-white">
                    {b.unread}
                  </span>
                )}
                <MessageCircle size={17} className="shrink-0 text-primary-500" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="px-1 pb-2 text-[11px] leading-relaxed text-ink-400">
        <UserPlus size={11} className="mr-1 inline" />
        想新增绑定？在「亲友与家人」生成 6 位邀请码发给对方。
      </p>
    </div>
  );
}
