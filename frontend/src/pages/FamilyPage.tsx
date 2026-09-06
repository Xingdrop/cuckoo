/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL3BhZ2VzL0ZhbWlseVBhZ2UudHN4fDIwMjYtMDl8Nzk1N2RmZmUwNg== */
import { ChevronLeft, Copy, RefreshCw, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { ConfirmModal } from '../components/ConfirmModal';
import { ErrorBanner, LoadingState } from '../components/ui/Feedback';
import { contactsApi, type EmergencyContactItem } from '../services/api/api.contacts';
import { familyApi, type FamilyBindingItem } from '../services/api/api.family';
import { absoluteUrl, errorMessage } from '../services/http';
import { useAuthStore } from '../stores/authStore';
import { bindCodeSchema, contactSchema, type ContactInput } from '../types/schemas';

/** 亲友中心：邀请码绑定 + 联系人（漏服/库存通知）管理（FR-306/310~313） */
export function FamilyPage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const [bindings, setBindings] = useState<FamilyBindingItem[] | null>(null);
  const [contacts, setContacts] = useState<EmergencyContactItem[] | null>(null);
  const [invite, setInvite] = useState<{ code: string | null; expiresAt: string | null } | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmUnbind, setConfirmUnbind] = useState<FamilyBindingItem | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyContactItem | null>(null);
  const [confirmContact, setConfirmContact] = useState<EmergencyContactItem | null>(null);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const reload = useCallback(async () => {
    try {
      const [b, c, inv] = await Promise.all([
        familyApi.listBindings(),
        contactsApi.list().catch(() => [] as EmergencyContactItem[]),
        familyApi.myInvite(),
      ]);
      setBindings(b);
      setContacts(c);
      setInvite(inv);
    } catch (e) {
      setError(errorMessage(e));
      setBindings([]);
      setContacts([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** 生成/刷新邀请码 */
  const handleCreateInvite = async () => {
    setBusy(true);
    setError(null);
    try {
      setInvite(await familyApi.createInvite());
      flash('邀请码已生成，24 小时内有效');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** 复制邀请码 */
  const handleCopy = async () => {
    if (!invite?.code) return;
    try {
      await navigator.clipboard.writeText(invite.code);
      flash('已复制，发给对方后在「TA 的邀请码」中提交');
    } catch {
      flash(`邀请码：${invite.code}`);
    }
  };

  /** 凭对方邀请码申请绑定 */
  const handleBind = async () => {
    const parsed = bindCodeSchema.safeParse({ code: codeInput });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '邀请码格式不正确');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await familyApi.bind(parsed.data.code);
      setCodeInput('');
      flash('申请已发送，等待对方确认');
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** 审批（同意/拒绝） */
  const handleRespond = async (b: FamilyBindingItem, approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await (approve ? familyApi.approve(b.id) : familyApi.reject(b.id));
      flash(approve ? '已同意，你们现在是亲友了' : '已拒绝');
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** 解除绑定 */
  const handleUnbind = async () => {
    if (!confirmUnbind) return;
    setBusy(true);
    try {
      await familyApi.unbind(confirmUnbind.id);
      flash('已解除绑定');
      setConfirmUnbind(null);
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pendingIncoming = bindings?.filter((b) => b.status === 'pending' && b.iAmApprover) ?? [];
  const active = bindings?.filter((b) => b.status === 'active') ?? [];

  return (
    <div className="mx-auto max-w-md pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-bg px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center text-ink-700"
          aria-label="返回"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-lg font-semibold">亲友</h1>
      </header>
      <main className="px-4 pt-1">
        <ErrorBanner message={error} />
        {notice && <p className="mb-3 rounded-btn bg-primary-500/10 px-3 py-2 text-sm text-primary-700">{notice}</p>}

        {/* 我的邀请码 */}
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">我的邀请码</h2>
            <button
              onClick={handleCreateInvite}
              disabled={busy}
              className="flex h-8 items-center gap-1 rounded-lg bg-primary-50 px-3 text-xs font-medium text-primary-700 disabled:opacity-50"
            >
              <RefreshCw size={13} /> {invite?.code ? '刷新' : '生成'}
            </button>
          </div>
          {invite?.code ? (
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="font-mono text-2xl tracking-[0.3em] text-primary-700">{invite.code}</span>
              <button
                onClick={handleCopy}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100 text-ink-600"
                aria-label="复制邀请码"
              >
                <Copy size={15} />
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-ink-500">
              生成邀请码发给家人朋友：对方在「TA 的邀请码」中提交，你确认后完成绑定。
            </p>
          )}
        </section>

        {/* 输入对方邀请码 */}
        <section className="mt-3 rounded-card bg-surface p-4 shadow-sm">
          <h2 className="text-sm font-semibold">TA 的邀请码</h2>
          <div className="mt-3 flex gap-2">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="6 位邀请码"
              maxLength={6}
              className="min-w-0 flex-1 rounded-btn border border-ink-200 bg-white px-3 py-2.5 font-mono text-base tracking-widest outline-none focus:border-primary-500"
            />
            <button
              onClick={handleBind}
              disabled={busy || codeInput.length !== 6}
              className="flex h-11 shrink-0 items-center gap-1 rounded-btn bg-primary-500 px-4 text-sm font-medium text-white disabled:opacity-40"
            >
              <UserPlus size={15} /> 申请绑定
            </button>
          </div>
        </section>

        {/* 待我审批 */}
        {pendingIncoming.length > 0 && (
          <section className="mt-3 rounded-card bg-surface p-4 shadow-sm">
            <h2 className="text-sm font-semibold">待处理的申请</h2>
            <ul className="mt-3 space-y-3">
              {pendingIncoming.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm">@{b.peer.username}</span>
                  <span className="flex shrink-0 gap-2">
                    <button
                      onClick={() => handleRespond(b, true)}
                      disabled={busy}
                      className="h-8 rounded-lg bg-primary-500 px-3 text-xs font-medium text-white disabled:opacity-50"
                    >
                      同意
                    </button>
                    <button
                      onClick={() => handleRespond(b, false)}
                      disabled={busy}
                      className="h-8 rounded-lg bg-ink-100 px-3 text-xs font-medium text-ink-600 disabled:opacity-50"
                    >
                      拒绝
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 已绑定亲友 */}
        <section className="mt-3 rounded-card bg-surface p-4 shadow-sm">
          <h2 className="text-sm font-semibold">我的亲友（{active.length}）</h2>
          {bindings === null ? (
            <LoadingState />
          ) : active.length === 0 ? (
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              还没有绑定的亲友。绑定后可以查看彼此的提醒完成情况、照片记录与药品库存，还能互发消息。
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {active.map((b) => (
                <li key={b.id} className="rounded-card border border-ink-100 p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-sm font-semibold text-primary-600">
                      {b.peer.avatarUrl ? (
                        <img src={absoluteUrl(b.peer.avatarUrl)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        b.peer.username.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">@{b.peer.username}</p>
                      {b.unread > 0 && <p className="text-xs text-danger-600">{b.unread} 条未读消息</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => navigate(`/family/partner/${b.id}`)}
                      className="h-9 flex-1 rounded-lg bg-primary-50 text-xs font-medium text-primary-700"
                    >
                      健康摘要
                    </button>
                    <button
                      onClick={() => navigate(`/family/chat/${b.id}`)}
                      className="h-9 flex-1 rounded-lg bg-primary-50 text-xs font-medium text-primary-700"
                    >
                      聊天{b.unread > 0 ? ` (${b.unread})` : ''}
                    </button>
                    <button
                      onClick={() => setConfirmUnbind(b)}
                      className="h-9 rounded-lg bg-ink-100 px-3 text-xs font-medium text-ink-600"
                    >
                      解除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 联系人（漏服/库存通知） */}
        <section className="mt-3 rounded-card bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Users size={15} /> 漏服/库存通知联系人（{contacts?.length ?? 0}）
            </h2>
            <button
              onClick={() => {
                setEditingContact(null);
                setShowContactForm(true);
              }}
              className="flex h-8 items-center rounded-lg bg-primary-50 px-3 text-xs font-medium text-primary-700"
            >
              <UserPlus size={13} className="mr-1" /> 添加
            </button>
          </div>
          {contacts === null ? (
            <LoadingState />
          ) : contacts.length === 0 ? (
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              添加联系人后，提醒超时未完成或药品库存不足时可通知 TA（可关联已绑定的亲友账户）。
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-card border border-ink-100 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {c.name}
                      {c.relation ? <span className="ml-1 text-xs text-ink-500">（{c.relation}）</span> : null}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {[c.phone, c.receiveMissed ? '漏服' : null, c.receiveLowStock ? '库存' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <span className="flex shrink-0 gap-2">
                    <button
                      onClick={() => {
                        setEditingContact(c);
                        setShowContactForm(true);
                      }}
                      className="h-8 rounded-lg bg-ink-100 px-3 text-xs font-medium text-ink-600"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => setConfirmContact(c)}
                      className="h-8 rounded-lg bg-danger-500/10 px-3 text-xs font-medium text-danger-700"
                    >
                      删除
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <ContactFormModal
        open={showContactForm}
        editing={editingContact}
        bindings={active}
        meId={me?.id ?? ''}
        onClose={() => setShowContactForm(false)}
        onSaved={async () => {
          setShowContactForm(false);
          await reload();
        }}
      />

      <ConfirmModal
        open={confirmUnbind !== null}
        title="解除绑定"
        message={`确定解除与 @${confirmUnbind?.peer.username ?? ''} 的亲友绑定？解除后立即生效，双方都无法再查看对方的健康数据（聊天记录将保留）。`}
        confirmText="解除"
        onConfirm={handleUnbind}
        onCancel={() => setConfirmUnbind(null)}
      />

      <ConfirmModal
        open={confirmContact !== null}
        title="删除联系人"
        message={`确定删除联系人「${confirmContact?.name ?? ''}」？删除后将不再收到 TA 的漏服/库存通知。`}
        confirmText="删除"
        onConfirm={async () => {
          if (!confirmContact) return;
          try {
            await contactsApi.remove(confirmContact.id);
            setConfirmContact(null);
            await reload();
          } catch (e) {
            setError(errorMessage(e));
            setConfirmContact(null);
          }
        }}
        onCancel={() => setConfirmContact(null)}
      />

      <BottomNav />
    </div>
  );
}

/** 联系人新增/编辑弹窗（复用已绑定亲友作为关联账户选项） */
function ContactFormModal({
  open,
  editing,
  bindings,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: EmergencyContactItem | null;
  bindings: FamilyBindingItem[];
  meId: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [appUserId, setAppUserId] = useState('');
  const [receiveMissed, setReceiveMissed] = useState(true);
  const [receiveLowStock, setReceiveLowStock] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setPhone(editing?.phone ?? '');
      setRelation(editing?.relation ?? '');
      setAppUserId(editing?.appUserId ?? '');
      setReceiveMissed(editing?.receiveMissed ?? true);
      setReceiveLowStock(editing?.receiveLowStock ?? true);
      setError(null);
    }
  }, [open, editing]);

  if (!open) return null;

  const submit = async () => {
    const body: ContactInput = {
      name,
      phone: phone || null,
      relation: relation || null,
      appUserId: appUserId || null,
      receiveMissed,
      receiveLowStock,
    };
    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '表单校验失败');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing) await contactsApi.update(editing.id, parsed.data);
      else await contactsApi.create(parsed.data);
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal>
      <div className="w-full max-w-sm rounded-card bg-surface p-5 shadow-xl">
      <h3 className="text-base font-semibold">{editing ? '编辑联系人' : '添加联系人'}</h3>
      <div className="mt-4 space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="姓名 *"
          maxLength={50}
          className="w-full rounded-btn border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-500"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="手机号（短信通道预留，可空）"
          maxLength={20}
          inputMode="tel"
          className="w-full rounded-btn border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-500"
        />
        <input
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          placeholder="关系（家人/朋友等）"
          maxLength={20}
          className="w-full rounded-btn border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-500"
        />
        <select
          value={appUserId}
          onChange={(e) => setAppUserId(e.target.value)}
          className="w-full rounded-btn border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-500"
        >
          <option value="">关联布谷账户（不关联）</option>
          {bindings.map((b) => (
            <option key={b.id} value={b.peer.id}>
              @{b.peer.username}
            </option>
          ))}
        </select>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={receiveMissed} onChange={(e) => setReceiveMissed(e.target.checked)} />
            漏服通知
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={receiveLowStock} onChange={(e) => setReceiveLowStock(e.target.checked)} />
            库存预警
          </label>
        </div>
      </div>
      <ErrorBanner message={error} />
      <div className="mt-4 flex gap-3">
        <button onClick={onClose} className="h-10 flex-1 rounded-btn bg-ink-100 text-sm font-medium text-ink-700">
          取消
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="h-10 flex-1 rounded-btn bg-primary-500 text-sm font-medium text-white disabled:opacity-50"
        >
          保存
        </button>
      </div>
      </div>
    </Modal>
  );
}

/** 居中弹窗容器（与 ConfirmModal 同风格；不引入新依赖） */
function Modal({ children }: { children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8">{children}</div>,
    document.body,
  );
}
