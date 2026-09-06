/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL2NvbXBvbmVudHMvQ29sbGFwc2libGVTZWN0aW9uLnRzeHwyMDI2LTA5fDI1ZTNhMjhmOTc= */
import { ChevronDown } from 'lucide-react';
import { ReactNode, useState } from 'react';

/**
 * 通用折叠分区（#6：全部提醒 / 服务与管理共用模块）。
 * - 标题区（emoji + 标题 + 可选角标 + 展开/收起箭头）可点击
 * - 折叠状态持久化（localStorage，key 需唯一）
 * - 内容渲染带过渡
 */
export function CollapsibleSection({
  id,
  icon,
  title,
  badge,
  defaultOpen,
  /** 头部左侧动作插槽（如「一键清空」小按钮）——点击不触发折叠 */
  headerAction,
  children,
}: {
  id: string;
  icon: string;
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(`cuckoo_collapse_${id}`) !== '0';
    } catch {
      return defaultOpen ?? true;
    }
  });

  const toggle = () => {
    setOpen((v) => {
      localStorage.setItem(`cuckoo_collapse_${id}`, v ? '0' : '1');
      return !v;
    });
  };

  return (
    <section className="mb-4">
      <div className="flex w-full items-center gap-1.5 rounded-btn bg-surface px-3 py-2.5 shadow-sm">
        {headerAction}
        <button
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
        <ChevronDown
          size={14}
          className={`shrink-0 text-ink-400 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
        <span className="text-xs font-medium text-ink-700">
          {icon} {title}
        </span>
        {badge !== undefined && <span className="text-[11px] text-ink-300">{badge}</span>}
          <span className="ml-auto shrink-0 text-[11px] text-ink-400">{open ? '收起' : '展开'}</span>
        </button>
      </div>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}
