/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3BhZ2VzL0Rhc2hib2FyZFBhZ2UudHN4fDIwMjYtMDl8ZjA0NDEzOTI5ZA== */ */
import { BarChart3, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, Mic, Plus, Settings, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { ReminderDetailModal } from '../components/ReminderDetailModal';
import { VoiceAssistant } from '../features/voice/VoiceAssistant';
import { remindersApi } from '../services/api/api.reminders';
import { authApi } from '../services/api/api.auth';
import { statsApi, DashboardStats, WaterInfo } from '../services/api/api.stats';
import { filesApi } from '../services/api/api.files';
import { useGuestStore } from '../guest/guestStore';
import { useLocal } from '../guest/localMode';
import { compressMediaFile } from '../utils/media';
import { captureNativePhoto } from '../utils/cameraCapture';
import { dateHead, festivalIcon, lunarInfo, shiftKey, todayKey } from '../utils/calendar';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
import type { CalendarItem } from '../types';

const CATEGORY_EMOJI: Record<string, string> = {
  medication: '💊',
  exercise: '🏃',
  water: '💧',
  rest: '😴',
  work: '💼',
  custom: '📌',
};

/** 完成的次数（仅 completed/challenge_completed，不含错过/跳过） */
function doneCount(item: CalendarItem): number {
  return item.times.filter(
    (t) => t.status === 'completed' || t.status === 'challenge_completed',
  ).length;
}

/** 错过的次数（missed/skipped 状态，或未完成且时间已过） */
function missedCount(item: CalendarItem, dateKey: string, today: string, nowTime: string): number {
  return item.times.filter(
    (t) =>
      t.status === 'missed' ||
      t.status === 'skipped' ||
      (t.status === null && (dateKey < today || (dateKey === today && t.time < nowTime))),
  ).length;
}

/** #26 详情浮窗：指定时点是否可直接完成（错过 → false 走确认弹窗；不定时/待完成 → true） */
function itemSlotDone(item: CalendarItem, time?: string): boolean {
  if (item.untimed || !time) return true;
  const slot = item.times.find((s) => s.time === time);
  return !slot || slot.status !== 'missed';
}

/** 距目标时间（日期+HH:mm，本地）的间隔文案 */
function untilLabel(dateKey: string, time: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const diffMs = new Date(y, m - 1, d, hh, mm).getTime() - Date.now();
  if (diffMs <= 0) return '';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return '即将提醒';
  if (mins < 60) return `${mins} 分钟后`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem > 0 ? `${hours} 小时 ${rem} 分后` : `${hours} 小时后`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH > 0 ? `${days} 天 ${remH} 小时后` : `${days} 天后`;
}

/** #8：延迟中的槽位显示新时间（原时刻 + 累计延迟分钟，跨小时进位） */
function slotTime(t: { time: string; delayMinutes?: number }): string {
  if (!t.delayMinutes) return t.time;
  const [h, m] = t.time.split(':').map(Number);
  const total = h * 60 + m + t.delayMinutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** #7（2026-09-09）：延迟中的槽位若新时刻（原时刻+延迟）已过超 30 分钟宽限仍无响应 → 视为已错过。
 * 此前后端错过扫描只处理 nextTriggerAt 的精确匹配，延迟槽（原时刻日志+delayMinutes）永远停留在
 * 待办（真机反馈"都 22 点了 0 点的延迟提醒还挂在待办"）。分钟制跨午夜安全。 */
function delayedSlotExpired(time: string, delayMinutes: number | undefined, nowTime: string): boolean {
  if (!delayMinutes) return false;
  const [h, m] = time.split(':').map(Number);
  const base = h * 60 + m;
  let eff = base + delayMinutes;
  if (eff < base) eff += 1440; // 跨午夜（23:50 延迟 20 分 → 次日 00:10）
  const [nh, nm] = nowTime.split(':').map(Number);
  return eff + 30 <= nh * 60 + nm;
}

/**
 * P-03 今日看板（日期切换版）
 * - 顶部：日期 + 农历/节日 + 快捷导航（3天前~3天后）+ 左右滑动切换
 * - 未到时间点：正常色按时间排列（已提醒过的显示 k/n 徽标）
 * - 已完成时间点：暗色 + ✓ + 绿色边框，排在下方的"已完成"分组
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const today = todayKey();
  const [selected, setSelected] = useState(today);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addedFlash, setAddedFlash] = useState<number | null>(null);
  /** #6：已完成/已错过分组折叠 */
  const [doneOpen, setDoneOpen] = useState(false);
  const [missedOpen, setMissedOpen] = useState(false);
  // #4（2026-09-09 深夜）：已放弃独立折叠组
  const [abandonedOpen, setAbandonedOpen] = useState(false);
  /** #4：各日期独立喝水统计（key=YYYY-MM-DD） */
  const [waterStats, setWaterStats] = useState<Record<string, WaterInfo>>({});
  /** #20：完成率选择器 */
  const [ratePickerOpen, setRatePickerOpen] = useState(false);
  /** #26：喝水（当日达标）是否计入完成率 */
  const [waterRate, setWaterRate] = useState(false);
  useEffect(() => {
    authApi
      .getSettings()
      .then((s) => setWaterRate(s.waterCountInRate === true))
      .catch(() => undefined);
  }, []);
  const guestActive = useGuestStore((s) => s.active);
  /** #25：今日提醒点击查看详情 */
  const [detailItem, setDetailItem] = useState<CalendarItem | null>(null);
  // #7（2026-09-09 晚）：30s 时钟强制重渲染——错过判定用 nowTime，无重渲染时
  // 「22:10 的提醒 22:12 还挂在待办」要等下次数据变化才翻转
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  /** #24：点击日期 → 原生日期选择器（自选日期） */
  const datePickerRef = useRef<HTMLInputElement>(null);
  const openDatePicker = () => {
    const el = datePickerRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        /* 某些 WebView 抛错 → 回退 focus */
      }
    }
    el.focus();
  };
  /** 当前列水数据（今天用 dashboard 的 water，其他列用 waterInfo） */
  const water = selected === today && stats ? stats.water : waterStats[selected];

  const load = useCallback(
    async (date: string) => {
      try {
        setItems(await remindersApi.calendar(date));
        if (date === today) {
          statsApi.dashboard().then(setStats).catch(() => undefined);
        }
        // #4：喝水按日期独立（各列显示/记录各自日期）
        statsApi.waterInfo(date).then((w) => setWaterStats((m) => ({ ...m, [date]: w }))).catch(() => undefined);
      } catch {
        setError('加载失败，请刷新重试');
      } finally {
        setLoading(false);
      }
    },
    [today],
  );

  // 切换日期时不显示"加载中"（保留旧内容直到新数据就绪）
  useEffect(() => {
    setError(null);
    void load(selected);
  }, [selected, load]);

  // #53（2026-09-09）：提醒弹窗操作（完成/延迟/跳过/拍照）后立即刷新看板——
  // 调度器 handleAction 会广播 cuckoo:reminders-changed，此前看板不监听，只能等轮询
  useEffect(() => {
    const onChanged = () => void load(selected);
    window.addEventListener('cuckoo:reminders-changed', onChanged);
    return () => window.removeEventListener('cuckoo:reminders-changed', onChanged);
  }, [load, selected]);

  // 2026-09-13：语音助手开始录音时关闭本页所有弹层（确认框/详情浮窗），
  // 避免录音动画层与弹窗互相拦截形成死锁
  useEffect(() => {
    const closeModals = () => {
      setDetailItem(null);
      setCompleteConfirm(null);
    };
    window.addEventListener('cuckoo:close-modals', closeModals);
    return () => window.removeEventListener('cuckoo:close-modals', closeModals);
  }, []);

  // #25：左右滑动切换日期——document 级捕获，任何区域（含已错过列表/空白处）均可横滑
  useEffect(() => {
    let sx: number | null = null;
    let sy: number | null = null;
    const isInteract = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el?.closest?.('input, select, textarea, .fixed');
    };
    const ts = (e: TouchEvent) => {
      if (isInteract(e.target)) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    };
    const te = (e: TouchEvent) => {
      if (sx === null || sy === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      sx = null;
      sy = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        setSelected((s) => shiftKey(s, dx > 0 ? -1 : 1));
      }
    };
    document.addEventListener('touchstart', ts, { passive: true });
    document.addEventListener('touchend', te, { passive: true });
    return () => {
      document.removeEventListener('touchstart', ts);
      document.removeEventListener('touchend', te);
    };
  }, []);

  // 展开时间线：未完成（按时间）+ 已完成（按时间）
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const slots = items.flatMap((item) =>
    item.times.map((t) => ({
      time: t.time,
      // #8：延迟中的槽位显示新时间（原时刻+延迟分钟）
      displayTime: slotTime(t),
      status: t.status,
      item,
      isDone: t.status === 'completed' || t.status === 'challenge_completed',
      // #4（2026-09-09 深夜）：已放弃（skipped）单独成组，不再混入已错过
      // 已错过：missed 状态，或（未完成非终态 且 时间已过：今天已过 / 历史日期）
      // delayed（延迟执行中）不算错过，但新时刻已过超 30 分钟无响应 → 视为错过（#7 2026-09-09）
      // #2（2026-09-09 深夜）：photo/note 只是非终态记录——槽时刻已过同样判错过，
      // 此前 photo 槽无错过判定，22:10 拍照后未处理 23 点仍挂待办
      // #4：不定时无固定时刻 → 永不判错过（保持 pending，可完成/放弃）
      isMissed:
        !item.untimed &&
        (t.status === 'missed' ||
          (t.status === 'delayed' && delayedSlotExpired(t.time, t.delayMinutes, nowTime)) ||
          ((t.status === null || t.status === 'photo' || t.status === 'note') &&
            (selected < today || (selected === today && t.time < nowTime)))),
      isAbandoned: t.status === 'skipped',
    })),
  );  // #18：间隔提醒（当日多次）聚合为**单卡**——不再在三个分组中重复出现
  const intervalIds = new Set(slots.filter((s) => isIntervalMulti(s.item)).map((s) => s.item.reminderId));
  const regularSlots = slots.filter((s) => !intervalIds.has(s.item.reminderId));
  const intervalItems = [
    ...new Map(
      slots
        .filter((s) => intervalIds.has(s.item.reminderId))
        .map((s) => [s.item.reminderId, s.item]),
    ).values(),
  ];
  const pendingSlots = regularSlots
    .filter((s) => !s.isDone && !s.isMissed && !s.isAbandoned)
    .sort((a, b) => a.time.localeCompare(b.time));
  const doneSlots = regularSlots
    .filter((s) => s.isDone)
    .sort((a, b) => a.time.localeCompare(b.time));
  const missedSlots = regularSlots
    .filter((s) => s.isMissed)
    .sort((a, b) => a.time.localeCompare(b.time));
  // #4（2026-09-09 深夜）：已放弃单独分组——用户主动放弃 ≠ 被动错过
  const abandonedSlots = regularSlots
    .filter((s) => s.isAbandoned)
    .sort((a, b) => a.time.localeCompare(b.time));

  /** #20：完成率仅统计「计入完成率」的提醒 */
  const rateSlots = slots.filter((s) => s.item.countInRate !== false);
  const totalDone = rateSlots.filter((s) => s.isDone).length;
  const totalPlanned = rateSlots.length;
  const rate = totalPlanned > 0 ? Math.round((totalDone / totalPlanned) * 100) : 0;

  /** #21：间隔提醒逐时点打卡（完成/放弃 仅影响该时点；#26 可带照片记录） */
  const intervalAck = async (item: CalendarItem, time: string, status: 'completed' | 'skipped', photoUrl?: string) => {
    const [y, m, d] = selected.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const slot = new Date(y, m - 1, d, hh, mm);
    try {
      await remindersApi.ack(item.reminderId, { status, scheduledTime: slot.toISOString(), photoUrl });
    } catch {
      /* 重复/失败静默，刷新后以服务端为准 */
    }
    void load(selected);
  };

  /** #20：切换提醒是否计入完成率 */
  const toggleRate = async (item: CalendarItem) => {
    try {
      await remindersApi.update(item.reminderId, { countInRate: item.countInRate !== false ? false : true });
    } catch {
      /* 忽略 */
    }
    void load(selected);
  };

  const lunar = lunarInfo(selected);
  // #14：今日前后天数差（不定时 ±3 天可确认）
  const dayDiff = Math.round(
    (new Date(`${selected}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000,
  );

  /** #12：不定时提醒 完成/放弃（今日）——记录到当日正午（ack 仅需唯一时刻） */
  const untimedAck = async (item: CalendarItem, status: 'completed' | 'skipped', photoUrl?: string) => {
    const [y, m, d] = selected.split('-').map(Number);
    const noon = new Date(y, m - 1, d, 12, 0);
    try {
      await remindersApi.ack(item.reminderId, { status, scheduledTime: noon.toISOString(), photoUrl });
    } catch {
      /* 重复/失败静默，刷新后以服务端为准 */
    }
    void load(selected);
  };

  /** #26：今日页行内「📷」——拍/选照片 → 压缩（→上传/本机暂存）→ 立即形成拍照记录并提交（不询问完成与否） */
  const camRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  /** #9（2026-09-09 真机修复）：拍照目标改用 ref——此前 setState 后立刻调 onCamPicked，
   * 闭包里的 camTarget 还是旧值（null）→ 静默 return，「补拍照片永远不上传」的根因 */
  const camTargetRef = useRef<CalendarItem | null>(null);
  const openCameraFor = async (item: CalendarItem, _time?: string) => {
    camTargetRef.current = item;
    // #8（2026-09-07）：APK 用 @capacitor/camera 原生拍照（WebView file chooser 会闪退）
    // Web 端返回 undefined → 回退隐藏 input；原生取消返回 null → 仅清理状态
    const nativeFile = await captureNativePhoto();
    if (nativeFile === undefined) {
      camRef.current?.click();
      return;
    }
    if (nativeFile) void onCamPicked(nativeFile);
    else camTargetRef.current = null;
  };
  /** #8：详情弹窗开着补拍 → 照片上报成功后 bump，让弹窗重新拉取当日记录以显示新照片 */
  const [detailRefresh, setDetailRefresh] = useState(0);
  const onCamPicked = async (file: File | undefined) => {
    const target = camTargetRef.current;
    camTargetRef.current = null;
    if (!file || !target) return;
    try {
      const compressed = await compressMediaFile(file);
      /** 上传失败（离线/服务器未达）→ 压缩后以 base64 暂存本机（照片记录页可见）。
       *  2026-09-13：离线/镜像模式直接走本机暂存——此前仍会先试上传，网络不可达时
       *  干等 15s 超时，用户以为「补拍后照片不显示」 */
      let url: string;
      if (useLocal()) {
        url = await new Promise<string>((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result ?? ''));
          fr.onerror = () => resolve('');
          fr.readAsDataURL(compressed);
        });
        if (!url) throw new Error('encode');
        showToast('📷 照片已暂存本机（联网后同步）');
      } else {
        try {
          const r = await filesApi.upload(compressed);
          url = r.url;
          showToast('📷 照片已提交');
        } catch {
          url = await new Promise<string>((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result ?? ''));
            fr.onerror = () => resolve('');
            fr.readAsDataURL(compressed);
          });
          if (!url) throw new Error('encode');
          showToast('📷 照片已暂存本机（联网后上传）');
        }
      }
      // 拍照即形成记录并提交（photo 状态——独立于完成标记，不计入完成率）
      await remindersApi.ack(target.reminderId, {
        status: 'photo',
        scheduledTime: new Date().toISOString(),
        photoUrl: url,
      });
      void load(selected);
      // 详情弹窗仍开着 → 刷新其内部日志，用户立即可查看刚拍的照片（2026-09-07 #8）
      setDetailRefresh((v) => v + 1);
    } catch {
      showToast('照片处理失败，请重试');
    }
  };

  /** #26：已错过 点击确认改为已完成（不含拍照；确认后才修改） */
  const [completeConfirm, setCompleteConfirm] = useState<{
    item: CalendarItem;
    time?: string;
  } | null>(null);
  const [completeBusy, setCompleteBusy] = useState(false);
  const confirmComplete = async () => {
    const c = completeConfirm;
    if (!c) return;
    setCompleteBusy(true);
    try {
      if (c.time) await intervalAck(c.item, c.time, 'completed');
      else await untimedAck(c.item, 'completed');
      showToast('✅ 已修改为已完成');
      setCompleteConfirm(null);
    } finally {
      setCompleteBusy(false);
    }
  };

  return (
    <div
      className="mx-auto max-w-md overflow-x-clip pb-20"
      style={{ touchAction: 'pan-y' }}
    >
      {/* #24：顶部日期头——两行布局（日期居中不挤压）+ 点击自选日期 */}
      <header className="px-4 pt-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelected((s) => shiftKey(s, -1))}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100"
            aria-label="前一天"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={openDatePicker}
            aria-label="选择日期"
            className="min-w-0 flex-1 px-2 text-center"
          >
            <span className="flex items-center justify-center gap-1.5">
              <span className="whitespace-nowrap text-lg font-semibold leading-tight">{dateHead(selected)}</span>
              {selected === today && (
                <span className="shrink-0 rounded-full bg-primary-500 px-2 py-0.5 text-[10px] text-white">
                  今天
                </span>
              )}
            </span>
            <span className="mt-0.5 block whitespace-nowrap text-[11px] leading-tight text-ink-500">
              {WEEKDAYS[new Date(`${selected}T00:00:00`).getDay()]} · 农历{lunar.lunar}
              {lunar.festival ? ` · ${festivalIcon(lunar.festival)}${lunar.festival}` : ''}
            </span>
            <input
              ref={datePickerRef}
              type="date"
              aria-hidden="true"
              tabIndex={-1}
              value={selected}
              onChange={(e) => e.target.value && setSelected(e.target.value)}
              className="pointer-events-none absolute h-0 w-0 opacity-0"
            />
          </button>
          <button
            onClick={() => setSelected((s) => shiftKey(s, 1))}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100"
            aria-label="后一天"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-end">
          <div className="flex shrink-0 items-center gap-2">
            {guestActive && (
              <span className="shrink-0 rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-medium text-accent-700">
                游客
              </span>
            )}
            <button
              onClick={() => navigate('/stats')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface p-0 text-primary-600 shadow-sm"
              aria-label="统计"
            >
              <BarChart3 size={17} />
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('cuckoo:voice-history'))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface p-0 text-ink-700 shadow-sm"
              aria-label="语音执行历史"
            >
              <Mic size={17} />
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface p-0 text-ink-700 shadow-sm"
              aria-label="设置"
            >
              <Settings size={17} />
            </button>
          </div>
        </div>
      </header>

      <main className="px-4">
        {/* 完成率 + 喝水并排：#26 两卡等高（完成率内容压缩对齐水卡高度） */}
        <div className="mt-4 grid grid-cols-2 items-stretch gap-3">
        {/* #20：完成率卡 —— 点击进入「选择计入提醒」 */}
          <button
            onClick={() => setRatePickerOpen(true)}
            className="rounded-card bg-surface p-3 text-left shadow-sm"
            aria-label="选择计入完成率的提醒"
          >
            {/* 顶部：完成率标题 + 右侧操作列（选择=淡底胶囊；统计=实底胶囊，主题变量保证三主题可见） */}
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-ink-500">完成率</p>
              <span className="flex flex-col items-end gap-1">
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="完成率选择入口"
                  className="flex items-center gap-0.5 rounded-full bg-ink-100/80 px-1.5 py-0.5 text-[10px] font-medium text-ink-600"
                >
                  <SlidersHorizontal size={9} strokeWidth={2.4} /> 选择
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="进入统计"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/stats');
                  }}
                  className="flex items-center gap-0.5 rounded-full bg-primary-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                >
                  <BarChart3 size={10} strokeWidth={2.6} /> 统计
                </span>
              </span>
            </div>
            <p className="-mt-1 text-2xl font-bold leading-none text-primary-600">
              {selected === today && stats ? stats.rate : rate}%
            </p>
            <p className="mt-1.5 text-[11px] leading-tight text-ink-500">
              {selected === today && stats ? stats.done : totalDone}/{selected === today && stats ? stats.planned : totalPlanned} 完成
              {selected === today && missedSlots.length > 0 && (
                <span className="text-danger-700"> · 错过 {missedSlots.length}</span>
              )}
            </p>
            {selected === today && stats && (
              <p className="mt-1.5 h-4 truncate text-[10px] font-medium text-accent-700">🔥 连续 {stats.streakDays} 天</p>
            )}
          </button>

          <section
            className={`rounded-card p-3 shadow-sm transition-colors ${
              water && water.rate >= 100
                ? 'bg-gradient-to-r from-primary-500/15 to-primary-100/40 ring-2 ring-primary-500/60'
                : 'bg-surface'
            }`}
          >
            {/* #26：紧凑喝水卡——内容随高度收缩，不留大片空白；达标与否/点击记录都不改变方框 */}
            <div className="flex h-6 items-center justify-between">
              <p className="flex min-w-0 items-center gap-1 text-sm font-semibold text-ink-700">
                <span className="shrink-0 text-base">💧</span>
                <span className="shrink-0">喝水</span>
              </p>
              <div className="relative shrink-0">
                {selected === today ? (
                  <button
                    onClick={async () => {
                      // #11：仅今日可记录
                      await statsApi.water(200).catch(() => undefined);
                      statsApi.dashboard().then(setStats).catch(() => undefined);
                      statsApi.waterInfo(selected).then((w) => setWaterStats((m) => ({ ...m, [selected]: w }))).catch(() => undefined);
                      const t = Date.now();
                      setAddedFlash(t);
                      setTimeout(() => setAddedFlash((v) => (v === t ? null : v)), 900);
                    }}
                    className="rounded-full bg-primary-500 px-2 py-0.5 text-[11px] font-medium text-white"
                  >
                    +200
                  </button>
                ) : (
                  <span
                    className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-300"
                    title="只能记录今天的水"
                  >
                    +200
                  </span>
                )}
                {addedFlash !== null && (
                  <span
                    key={addedFlash}
                    className="water-add-float pointer-events-none absolute -top-5 right-0 text-xs font-semibold text-primary-600"
                  >
                    +200ml ✦
                  </span>
                )}
              </div>
            </div>
            {water ? (
              <>
                {/* 2026-09-09：mt-3.5 与左侧完成率 % 的基线对齐（此前 mt-2 导致数字偏高） */}
                <p className="mt-3.5 truncate text-2xl font-bold leading-none text-primary-600">
                  {water.waterMl}
                  <span className="ml-0.5 text-xs font-normal text-ink-400">ml</span>
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-primary-500 transition-all"
                    style={{ width: `${Math.min(100, water.rate)}%` }}
                  />
                </div>
                {/* 底部信息行（与完成率卡「连续 N 天」行等高）：✨ 与完成率 🔥 区分但同样有热情；
                    2026-09-09 晚：不再固定单行截断——系统字体放大时换行显示，杜绝「已达标 …」被截 */}
                <p className="mt-1 min-h-4 text-[10px] leading-4 text-ink-400">
                  {water.streakDays > 0 && (
                    <span className="font-medium text-primary-600">✨ 连续 {water.streakDays} 天 · </span>
                  )}
                  {selected !== today ? (
                    <>{selected.slice(5)} · {water.waterMl}ml</>
                  ) : water.rate >= 100 ? (
                    <span className="font-medium text-primary-600">✓ 已达标</span>
                  ) : (
                    <>还可喝 {Math.max(0, water.waterGoalMl - water.waterMl)}ml</>
                  )}
                </p>
              </>
            ) : (
              <p className="mt-2 h-8 text-[11px] text-ink-300">记录喝水进度</p>
            )}
          </section>
        </div>

        {/* 当日提醒时间线 */}
        <section className="mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">当日提醒</h2>
            <button
              onClick={() => navigate('/reminders/new')}
              className="flex h-11 items-center gap-1 text-sm text-primary-600"
            >
              <Plus size={16} /> 新建
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-btn bg-danger-500/10 px-3 py-2 text-sm text-danger-700">{error}</p>
          )}
          {loading ? (
            <div className="mt-3 rounded-card bg-surface p-8 text-center text-sm text-ink-500 shadow-sm">
              加载中…
            </div>
          ) : slots.length === 0 ? (
            <div className="mt-3 rounded-card bg-surface p-8 text-center shadow-sm">
              <div className="mx-auto mb-2 flex justify-center">
                <img src="/icons/icon-192.png" alt="布谷" className="h-20 w-20 rounded-2xl shadow-md" />
              </div>
              <p className="text-sm text-ink-500">
                {selected === today ? '今天还没有提醒，布谷鸟陪你从一个小习惯开始' : '这一天还没有安排提醒'}
              </p>
              {selected === today && (
                <button
                  onClick={() => navigate('/reminders/new')}
                  className="mt-3 block w-full rounded-btn bg-primary-500 py-3 text-sm font-medium text-white"
                >
                  创建今日提醒
                </button>
              )}
            </div>
          ) : (
            <>
          {/* #18：间隔提醒单卡（已完成/未提醒/已错过 汇总 ×/N，点击展开明细） */}
          {intervalItems.length > 0 && (
            <div className="mt-3 space-y-2">
              {intervalItems.map((item) => (
                <IntervalCard
                  key={`iv-${item.reminderId}`}
                  item={item}
                  selected={selected}
                  today={today}
                  nowTime={nowTime}
                  onSlotAck={intervalAck}
                  onDetails={setDetailItem}
                  onPhoto={openCameraFor}
                />
              ))}
            </div>
          )}
            <ul className="mt-3 space-y-2">
              {/* 未到时间点 */}
              {pendingSlots.map((s, i) => (
                <li
                  key={`p-${s.item.reminderId}-${s.time}-${i}`}
                  className="flex items-center gap-2.5 rounded-card bg-surface px-3 py-2.5 shadow-sm"
                >
                  <button
                    onClick={() => setDetailItem(s.item)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="w-10 shrink-0 text-right text-[10px] font-semibold leading-tight text-primary-600">
                      {s.item.untimed ? '不定时' : s.displayTime}
                      {s.displayTime !== s.time && (
                        <span className="block text-[9px] font-normal text-ink-400 line-through">{s.time}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-base">
                      {s.item.categoryIcon ?? CATEGORY_EMOJI[s.item.category] ?? '📌'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {s.item.category === 'custom' && s.item.categoryLabel
                          ? `${s.item.categoryLabel} · `
                          : ''}
                        {s.item.title}
                      </span>
                      {s.item.content.text && (
                        <span className="mt-0.5 block truncate text-xs text-ink-500">{s.item.content.text}</span>
                      )}
                    </span>
                  </button>
                  {(() => {
                    if (s.item.untimed) {
                      // #12/#14：不定时 — 完成/放弃（仅限今日前后 3 天可操作）
                      const canOperate = Math.abs(dayDiff) <= 3;
                      return canOperate ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            onClick={() => void untimedAck(s.item, 'completed')}
                            aria-label="完成"
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-white"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => void untimedAck(s.item, 'skipped')}
                            aria-label="放弃"
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-100 text-ink-500"
                          >
                            <X size={13} />
                          </button>
                          {/* #26：完成并拍照记录 */}
                          <button
                            onClick={() => openCameraFor(s.item)}
                            aria-label="完成并拍照记录"
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500/10 text-primary-600"
                          >
                            <Camera size={12} />
                          </button>
                        </div>
                      ) : (
                        <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] text-ink-300">
                          仅±3天
                        </span>
                      );
                    }
                    // 距离该时间点触发的间隔（以当前看板日期/时间为基准；
                    // 不用 reminder.nextTriggerAt——它可能已推进到明天，导致"明天的提醒显示 10 分钟后"）
                    const label = untilLabel(selected, s.displayTime);
                    return label ? (
                      <span className="shrink-0 rounded-full bg-primary-500/15 px-2 py-0.5 text-[10px] font-medium text-primary-700">
                        {label}
                      </span>
                    ) : null;
                  })()}
                </li>
              ))}
            </ul>
            </>
          )}

          {/* 已完成分组 */}
          {!loading && !error && doneSlots.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDoneOpen((v) => !v)}
                  className="flex items-center gap-2"
                  aria-expanded={doneOpen}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-[10px] text-white">
                    <Check size={12} />
                  </span>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-ink-500">
                    已完成（{doneSlots.length}）
                  </h3>
                  <ChevronDown size={13} className={`text-ink-400 transition-transform ${doneOpen ? '' : '-rotate-90'}`} />
                </button>
                <span className="h-px flex-1 bg-ink-100" />
              </div>
              {doneOpen && (
              <ul className="mt-2 space-y-2">
                {doneSlots.map((s, i) => {
                  const k = doneCount(s.item);
                  // 分母 = 有效计划数（总次数 - 错过次数），错过不计入
                  const effective = Math.max(1, s.item.todayTotal - missedCount(s.item, selected, today, nowTime));
                  return (
                    <li
                      key={`d-${s.item.reminderId}-${s.time}-${i}`}
                      className="flex items-center gap-3 rounded-card border-l-4 border-primary-500/60 bg-ink-100/60 px-4 py-3 opacity-80"
                    >
                      <button
                        onClick={() => setDetailItem(s.item)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                      <span className="w-10 shrink-0 text-right text-[10px] font-semibold text-ink-500">{s.item.untimed ? '不定时' : s.time}</span>
                      <span className="text-lg opacity-50">
                        {s.item.categoryIcon ?? CATEGORY_EMOJI[s.item.category] ?? '📌'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink-500 line-through decoration-ink-300">
                          {s.item.category === 'custom' && s.item.categoryLabel
                            ? `${s.item.categoryLabel} · `
                            : ''}
                          {s.item.title}
                        </span>
                        {s.item.content.text && (
                          <span className="mt-0.5 block truncate text-xs text-ink-500/70">{s.item.content.text}</span>
                        )}
                      </span>
                      </button>
                      {effective > 1 ? (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary-500/15 px-2.5 py-1 text-[10px] font-medium text-primary-700">
                          <Check size={11} /> 已完成 {k}/{effective} 次
                        </span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary-500 px-2.5 py-1 text-[10px] font-medium text-white">
                          <Check size={11} /> 今日已完成提醒
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              )}
            </div>
          )}

          {/* 已错过分组（今天已过未完成，醒目红色；#6 可折叠） */}
          {!loading && !error && missedSlots.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMissedOpen((v) => !v)}
                  className="flex items-center gap-2"
                  aria-expanded={missedOpen}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-danger-500 text-[10px] font-bold text-white">
                    !
                  </span>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-danger-700">
                    已错过（{missedSlots.length}）
                  </h3>
                  <ChevronDown size={13} className={`text-danger-400 transition-transform ${missedOpen ? '' : '-rotate-90'}`} />
                </button>
                <span className="h-px flex-1 bg-danger-500/30" />
              </div>
              {missedOpen && (
              <ul className="mt-2 space-y-2">
                {missedSlots.map((s, i) => {
                  return (
                  <li
                    key={`m-${s.item.reminderId}-${s.time}-${i}`}
                    className="flex items-center gap-3 rounded-card border-l-4 border-danger-500/70 bg-danger-500/5 px-4 py-3"
                  >
                    <button
                      onClick={() => setDetailItem(s.item)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      aria-label="查看详情"
                    >
                    <span className="w-10 shrink-0 text-right text-[10px] font-semibold text-danger-700">{s.item.untimed ? '不定时' : s.time}</span>
                    <span className="text-lg opacity-60">
                      {s.item.categoryIcon ?? CATEGORY_EMOJI[s.item.category] ?? '📌'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-danger-700">
                        {s.item.category === 'custom' && s.item.categoryLabel
                          ? `${s.item.categoryLabel} · `
                          : ''}
                        {s.item.title}
                      </span>
                      {s.item.content.text && (
                        <span className="mt-0.5 block truncate text-xs text-danger-700/70">{s.item.content.text}</span>
                      )}
                    </span>
                    </button>
                    {/* 已放弃已独立成组，错过组内全部为真错过 → 点击可改已完成 */}
                    <button
                      onClick={() => setCompleteConfirm({ item: s.item, time: s.item.untimed ? undefined : s.time })}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-danger-500 text-white"
                      aria-label="已错过，点击修改为已完成"
                    >
                      <X size={12} />
                    </button>
                    <button
                      onClick={() => {
                        openCameraFor(s.item, s.item.untimed ? undefined : s.time);
                      }}
                      aria-label="补记完成并拍照记录"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger-500/15 text-danger-600"
                    >
                      <Camera size={12} />
                    </button>
                  </li>
                );
              })}
              </ul>
              )}
            </div>
          )}

          {/* #4（2026-09-09 深夜）：已放弃分组（主动跳过，中性灰；允许再次确认完成） */}
          {!loading && !error && abandonedSlots.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAbandonedOpen((v) => !v)}
                  className="flex items-center gap-2"
                  aria-expanded={abandonedOpen}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-300 text-[10px] font-bold text-white">
                    ✕
                  </span>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-ink-500">
                    已放弃（{abandonedSlots.length}）
                  </h3>
                  <ChevronDown size={13} className={`text-ink-400 transition-transform ${abandonedOpen ? '' : '-rotate-90'}`} />
                </button>
                <span className="h-px flex-1 bg-ink-300/40" />
              </div>
              {abandonedOpen && (
              <ul className="mt-2 space-y-2">
                {abandonedSlots.map((s, i) => {
                  return (
                  <li
                    key={`a-${s.item.reminderId}-${s.time}-${i}`}
                    className="flex items-center gap-3 rounded-card border-l-4 border-ink-300 bg-ink-100/50 px-4 py-3"
                  >
                    <button
                      onClick={() => setDetailItem(s.item)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      aria-label="查看详情"
                    >
                    <span className="w-10 shrink-0 text-right text-[10px] font-semibold text-ink-500">{s.item.untimed ? '不定时' : s.time}</span>
                    <span className="text-lg opacity-60">
                      {s.item.categoryIcon ?? CATEGORY_EMOJI[s.item.category] ?? '📌'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-700">
                        {s.item.category === 'custom' && s.item.categoryLabel
                          ? `${s.item.categoryLabel} · `
                          : ''}
                        {s.item.title}
                      </span>
                      {s.item.content.text && (
                        <span className="mt-0.5 block truncate text-xs text-ink-500">{s.item.content.text}</span>
                      )}
                    </span>
                    </button>
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-300 text-white"
                      aria-label="已放弃"
                    >
                      <X size={12} />
                    </span>
                    {/* 主动放弃 ≠ 任务失败：保留再次完成入口（ack 回精确槽时刻） */}
                    <button
                      onClick={() => {
                        const [y, m, d] = selected.split('-').map(Number);
                        const [hh, mm] = s.item.untimed ? [12, 0] : s.time.split(':').map(Number);
                        void remindersApi
                          .ack(s.item.reminderId, {
                            status: 'completed',
                            scheduledTime: new Date(y, m - 1, d, hh, mm).toISOString(),
                          })
                          .catch(() => undefined)
                          .then(() => load(selected));
                      }}
                      aria-label="再次完成"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white"
                    >
                      <Check size={13} />
                    </button>
                  </li>
                );
              })}
              </ul>
              )}
            </div>
          )}
        </section>
      </main>

      {/* #20：完成率——选择计入的提醒（逐条勾选；不计入的仍正常提醒与打卡） */}
      {ratePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8">
          <div className="w-full max-w-sm rounded-card bg-surface p-5 shadow-xl">
            <h3 className="text-base font-semibold">计入完成率的提醒</h3>
            <p className="mt-1 text-[11px] text-ink-500">
              勾选的提醒才统计完成率；未勾选仍会正常提醒与打卡（默认全部计入）
            </p>
            <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-btn bg-bg p-2">
              {/* #26：喝水（当日达标）作为可选统计项——不建喝水提醒也可统计 */}
              <li className="flex items-center gap-2 rounded-btn bg-surface px-3 py-2">
                <span className="text-base">💧</span>
                <span className="min-w-0 flex-1 truncate text-sm">喝水（当日达标）</span>
                <button
                  type="button"
                  role="switch"
                  aria-label="喝水 计入完成率"
                  aria-checked={waterRate}
                  onClick={async () => {
                    const next = !waterRate;
                    setWaterRate(next);
                    try {
                      await authApi.updateSettings({ waterCountInRate: next });
                    } catch {
                      setWaterRate(!next);
                    }
                    if (selected === today) statsApi.dashboard().then(setStats).catch(() => undefined);
                  }}
                  className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ${
                    waterRate ? 'justify-end bg-primary-500' : 'justify-start bg-ink-200'
                  }`}
                >
                  <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
                </button>
              </li>
              {items.length === 0 && <li className="py-3 text-center text-xs text-ink-300">当日暂无提醒</li>}
              {items.map((item) => (
                <li
                  key={item.reminderId}
                  className="flex items-center gap-2 rounded-btn bg-surface px-3 py-2"
                >
                  <span className="text-base">{item.categoryIcon ?? CATEGORY_EMOJI[item.category] ?? '📌'}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-label={`${item.title} 计入完成率`}
                    aria-checked={item.countInRate !== false}
                    onClick={() => void toggleRate(item)}
                    className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ${
                      item.countInRate !== false ? 'justify-end bg-primary-500' : 'justify-start bg-ink-200'
                    }`}
                  >
                    <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setRatePickerOpen(false)}
              className="mt-4 w-full rounded-btn bg-primary-500 py-3 text-sm font-medium text-white"
            >
              完成
            </button>
          </div>
        </div>
      )}

      {/* #26：提醒详情浮窗（中央小窗：内容多图滑动 + 时点状态 + 完成/补拍） */}
      {detailItem && (
        <ReminderDetailModal
          item={detailItem}
          date={selected}
          refreshKey={detailRefresh}
          onClose={() => setDetailItem(null)}
          onComplete={(time) => {
            const missed = !itemSlotDone(detailItem, time);
            if (missed) {
              // 错过时点 → 关闭详情走确认弹窗（确认内「查看详情」可再打开）
              setDetailItem(null);
              setCompleteConfirm({ item: detailItem, time });
            } else {
              void (detailItem.untimed || !time
                ? untimedAck(detailItem, 'completed')
                : intervalAck(detailItem, time, 'completed'));
              showToast('✅ 已完成');
              setDetailItem(null);
            }
          }}
          onRetake={() => {
            // #8（2026-09-07）：保持弹窗开着，拍完回显照片（此前关闭弹窗 → 用户以为闪退且看不到照片）
            void openCameraFor(detailItem);
          }}
          onDataChanged={() => {
            // #58/#60（2026-09-09）：留言保存后立即回显——bump refreshKey 让弹窗重拉当日日志 + 看板同步刷新
            setDetailRefresh((v) => v + 1);
            void load(selected);
          }}
        />
      )}

      {/* #26：确认弹窗——已错过点击后确认才修改为已完成（#10：去「取消」按钮，右上 × 关闭，紧凑字号） */}
      {completeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8">
          <div className="relative w-full max-w-xs rounded-card bg-surface p-4 shadow-xl">
            <button
              onClick={() => setCompleteConfirm(null)}
              disabled={completeBusy}
              aria-label="关闭"
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 disabled:opacity-40"
            >
              <X size={15} />
            </button>
            <h3 className="pr-7 text-sm font-semibold">修改为已完成？</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
              「{completeConfirm.item.title}」{completeConfirm.time ? `${completeConfirm.time} · ` : ''}
              已错过，确认后将修改为已完成。
            </p>
            <div className="mt-3.5 flex gap-2">
              <button
                onClick={() => {
                  setDetailItem(completeConfirm.item);
                  setCompleteConfirm(null);
                }}
                className="flex-1 rounded-btn bg-ink-100 py-2 text-xs font-medium text-ink-700"
              >
                查看详情
              </button>
              <button
                onClick={() => void confirmComplete()}
                disabled={completeBusy}
                className="flex-1 rounded-btn bg-primary-500 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {completeBusy ? '处理中…' : '修改为已完成'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* #26：完成并拍照记录——隐藏拍照输入 + 轻提示 */}
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          void onCamPicked(f);
        }}
      />
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-32 z-[45] flex justify-center px-6">
          <p className="max-w-full truncate rounded-full bg-ink-900/90 px-4 py-2 text-xs text-white shadow-lg">
            {toast}
          </p>
        </div>
      )}

      {/* #26：语音助手（长按上滑划入麦克风唤醒） */}
      <VoiceAssistant onToast={showToast} />

      <BottomNav />
    </div>
  );
}

/**
 * #18：间隔提醒（当日多次）**单卡聚合**——不再按状态分成多张卡：
 * 顶部标注「已完成 z/N · 未提醒 p/N · 已错过 m/N」，点击展开明细（逐条列出状态）。
 */
function IntervalCard({
  item,
  selected,
  today,
  nowTime,
  onSlotAck,
  onDetails,
  onPhoto,
}: {
  item: CalendarItem;
  selected: string;
  today: string;
  nowTime: string;
  onSlotAck: (item: CalendarItem, time: string, status: 'completed' | 'skipped') => void;
  onDetails: (item: CalendarItem) => void;
  onPhoto: (item: CalendarItem, time: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = item.times.length;
  const done = item.times.filter((t) => t.status === 'completed' || t.status === 'challenge_completed').length;
  // #2/#4（2026-09-09 深夜）：photo/note 非终态超时判错过；skipped 归已放弃不混入错过
  const missed = item.times.filter(
    (t) =>
      t.status === 'missed' ||
      (t.status === 'delayed' && delayedSlotExpired(t.time, t.delayMinutes, nowTime)) ||
      ((t.status === null || t.status === 'photo' || t.status === 'note') &&
        (selected < today || (selected === today && t.time < nowTime))),
  ).length;
  const pending = total - done - missed;
  const chip = (n: number, text: string, cls: string) =>
    n > 0 ? (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{text}</span>
    ) : null;
  return (
    <div className="rounded-card border-l-4 border-primary-500/50 bg-surface px-4 py-3 shadow-sm">
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-3 text-left" aria-expanded={expanded}>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-lg"
          onClick={(e) => {
            e.stopPropagation();
            onDetails(item);
          }}
        >
          {item.categoryIcon ?? CATEGORY_EMOJI[item.category] ?? '📌'}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-sm font-medium underline-offset-2 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              onDetails(item);
            }}
          >
            {item.title}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-ink-500">
            {item.repeatRule?.type === 'interval'
              ? `每 ${item.repeatRule?.intervalValue ?? 1} ${(item.repeatRule?.intervalUnit as string) === 'minute' ? '分钟' : item.repeatRule?.intervalUnit === 'week' ? '周' : '小时'}`
              : `每日 ${total} 次`}
            <span className="text-ink-300"> · 共 {total} 次</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {chip(done, `已完成 ${done}/${total}`, 'bg-primary-500/15 text-primary-700')}
            {chip(pending, `未提醒 ${pending}/${total}`, 'bg-ink-100 text-ink-600')}
            {chip(missed, `已错过 ${missed}/${total}`, 'bg-danger-500/10 text-danger-700')}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-xs text-ink-400">
          {expanded ? '收起' : '查看详情'}
          <ChevronDown size={13} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} />
        </span>
      </button>
      {expanded && (
        <ul className="mt-2 space-y-1 border-t border-ink-100 pt-2">
          {item.times.map((t, i) => {
            const doneRow = t.status === 'completed' || t.status === 'challenge_completed';
            const skippedRow = t.status === 'skipped';
            // #2（2026-09-09 深夜）：photo/note 非终态超时同步判错过（与主列表一致）
            const missedRow =
              t.status === 'missed' ||
              (t.status === 'delayed' && delayedSlotExpired(t.time, t.delayMinutes, nowTime)) ||
              ((t.status === null || t.status === 'photo' || t.status === 'note') &&
                (selected < today || (selected === today && t.time < nowTime)));
            return (
              <li key={i} className="flex items-center gap-2 px-1 py-0.5 text-xs">
                <span>{doneRow ? '✅' : skippedRow || missedRow ? '⭕' : '🕒'}</span>
                <span className="font-medium">{t.time}</span>
                {doneRow ? (
                  <span className="text-ink-400">已完成</span>
                ) : skippedRow ? (
                  <span className="text-ink-400">已放弃</span>
                ) : missedRow ? (
                  <span className="text-danger-700">已错过</span>
                ) : (
                  <span className="text-ink-400">未提醒</span>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  {!doneRow && (
                    <>
                      {(missedRow || skippedRow) && (
                        <button
                          onClick={() => onSlotAck(item, t.time, 'completed')}
                          className="rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-medium text-white"
                        >
                          补记完成
                        </button>
                      )}
                      {!missedRow && !skippedRow && (
                        <>
                          <button
                            onClick={() => onSlotAck(item, t.time, 'completed')}
                            className="rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-medium text-white"
                          >
                            完成
                          </button>
                          <button
                            onClick={() => onSlotAck(item, t.time, 'skipped')}
                            className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-600"
                          >
                            放弃
                          </button>
                        </>
                      )}
                      {/* #26：完成并拍照记录（今日页行内） */}
                      <button
                        onClick={() => onPhoto(item, t.time)}
                        aria-label="完成并拍照记录"
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500/10 text-primary-600"
                      >
                        <Camera size={12} />
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** #4/#22：当日多次点聚合——"间隔重复"或"每日多次(≥4 个时间点)"都合并为单卡（避免十几行横条） */
function isIntervalMulti(item: CalendarItem): boolean {
  return item.times.length > 1 && (item.repeatRule?.type === 'interval' || item.times.length >= 4);
}
