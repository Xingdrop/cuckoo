/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8c3JjL2NvbXBvbmVudHMvQ29uZmlybU1vZGFsLnRzeHwyMDI2LTA5fDcxNTk5ZTA3N2E= */
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 通用确认弹窗（居中卡片，替代 window.confirm） */
export function ConfirmModal({
  open,
  title,
  message,
  confirmText = '删除',
  cancelText = '取消',
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8">
      <div className="w-full max-w-xs rounded-card bg-surface p-6 shadow-xl">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">{message}</p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-btn bg-ink-100 py-3 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100/70"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-btn bg-danger-500 py-3 text-sm font-medium text-white transition-colors hover:bg-danger-700"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
