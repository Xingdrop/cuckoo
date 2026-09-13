/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL2Fzc2lzdGFudC9hcGlDYXRhbG9nLnRzfDIwMjYtMDl8OTBhZTE1ZDQ0ZQ== */
import { authApi } from '../services/api/api.auth';
import { statsApi } from '../services/api/api.stats';
import { remindersApi, type CreateReminderInput } from '../services/api/api.reminders';
import type { CalendarItem, Reminder } from '../types';

/**
 * #26：语音助手——按钮 → API 目录。
 * 汇总「今日/提醒/社交/设置」各界面按钮对应的后端能力，
 * 提示词由助理把用户语音匹配到目录动作并返回 JSON 执行计划。
 * 2026-09-13：补齐提醒全生命周期动作（创建/完成/延迟/放弃/删除/启停/查询）——
 * 此前目录只有设置开关与喝水记录，「帮我订一个每天六点的提醒」无法执行。
 */

export interface CatalogAction {
  id: string;
  /** 中文能力描述（注入提示词） */
  desc: string;
  params?: { name: string; desc: string; values?: string[] }[];
  /** 是否允许 AI 直接执行（否则只说明） */
  exec: boolean;
  /** 执行函数（接收 AI 给出的 params） */
  run?: (params: Record<string, unknown>) => Promise<{ ok: boolean; msg: string }>;
}

/** 当前上下文（注入提示词，让 AI 知道今天日期与当前时刻） */
export function assistantContext() {
  const now = new Date();
  return {
    today: now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
    nowTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  };
}

/** 喝水进度（注入上下文；在线/离线通用） */
export async function assistantWaterProgress(): Promise<string> {
  try {
    const w = await statsApi.waterInfo();
    return `今日喝水 ${w.waterMl}/${w.waterGoalMl}ml`;
  } catch {
    return '未知';
  }
}

/** 今日提醒清单（含槽位状态与完成情况，注入提示词；在线/离线镜像通用） */
export async function assistantTodayReminders(): Promise<{ title: string; time: string; status: string }[]> {
  const today = new Date().toLocaleDateString('sv-SE');
  try {
    const [items, plan] = await Promise.all([
      remindersApi.list({ isActive: true }),
      remindersApi.calendar(today).catch(() => [] as CalendarItem[]),
    ]);
    return items.slice(0, 15).map((r) => {
      const item = plan.find((c) => c.reminderId === r.id);
      const sts: string[] = item && !item.untimed ? item.times.map((t) => t.status ?? '') : [];
      const done = sts.filter((x) => x === 'completed' || x === 'challenge_completed').length;
      let status: string;
      if (sts.length > 0 && done === sts.length) status = '已完成';
      else if (sts.includes('missed')) status = done > 0 ? '部分完成(有已错过槽)' : '已错过(可改回完成)';
      else if (done > 0) status = '部分完成';
      else if (sts.length > 0) status = '待完成';
      else status = '今日未排程';
      return {
        title: r.title,
        time:
          r.times && r.times.length > 0
            ? r.times.join('、')
            : r.nextTriggerAt
              ? new Date(r.nextTriggerAt).toTimeString().slice(0, 5)
              : '不定时',
        status,
      };
    });
  } catch {
    return [];
  }
}

/** 变更成功后广播（今日页/统计页监听此事件即时刷新，否则要等 10s 轮询） */
const notifyDataChanged = () => window.dispatchEvent(new CustomEvent('cuckoo:reminders-changed'));

const err = (e: unknown, fallback: string): string => {
  const msg = String((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '');
  return msg || fallback;
};

/** 按 title 模糊匹配提醒（完全相等 > 互相包含；在线/离线通用） */
async function findReminder(title: unknown): Promise<Reminder | null> {
  const t = String(title ?? '').trim();
  if (!t) return null;
  const items = await remindersApi.list();
  const exact = items.find((r) => r.title === t);
  if (exact) return exact;
  const inc = items.find((r) => r.title.includes(t) || t.includes(r.title));
  return inc ?? null;
}

/** 今日该提醒的待操作槽位（actionable：待完成/留言/延迟中/已拍照/已放弃）；
 *  aiTime（HH:mm）优先精确匹配；无匹配取第一个可操作槽；全无 → null */
async function findTodaySlot(
  reminderId: string,
  aiTime?: unknown,
): Promise<{ time: string } | null> {
  const today = new Date().toLocaleDateString('sv-SE');
  let item: CalendarItem | undefined;
  try {
    const plan = await remindersApi.calendar(today);
    item = plan.find((c) => c.reminderId === reminderId);
  } catch {
    return null;
  }
  if (!item || item.untimed) return null;
  const actionable = (s: string | null) =>
    !s || s === 'delayed' || s === 'note' || s === 'photo' || s === 'skipped' || s === 'missed';
  const slots = item.times.filter((s) => actionable(s.status));
  if (slots.length === 0) return null;
  const t = String(aiTime ?? '').trim();
  if (t) {
    const norm = /^\d{1,2}:\d{2}$/.test(t) ? t.padStart(5, '0') : t;
    const hit = slots.find((s) => s.time === norm);
    if (hit) return hit;
  }
  return slots[0];
}

/** 本地时区把 HH:mm 变成今日（或下一个 occurrence）的 ISO 时刻 */
function slotIsoToday(hhmm: string): string {
  const [hh, mm] = hhmm.split(':').map(Number);
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1); // 已过 → 明天同时刻
  return d.toISOString();
}

const settingsRun =
  (key: 'notificationEnabled' | 'soundEnabled' | 'vibrationEnabled' | 'showSkipButton' | 'waterGoalMl' | 'waterCountInRate') =>
  async (params: Record<string, unknown>): Promise<{ ok: boolean; msg: string }> => {
    const val = params?.value;
    if (val === undefined || val === null) return { ok: false, msg: '缺少参数 value' };
    try {
      await authApi.updateSettings({ [key]: val } as never);
      return { ok: true, msg: `已将设置更新为 ${String(val)}` };
    } catch {
      /* 本地即席写入（离线） */
      return { ok: false, msg: '未联网，设置未能保存' };
    }
  };

export const CATALOG: CatalogAction[] = [
  // ===== 提醒生命周期（2026-09-13 新增） =====
  {
    id: 'reminder.create',
    desc: '新建提醒（title: 标题；time: "HH:mm" 首次触发时间；repeat: once/daily/weekly/monthly，默认 daily；days: weekly 时如 "1,3,5"（0=周日）；category: water/medication/exercise/rest/work/custom，默认 custom）',
    params: [
      { name: 'title', desc: '提醒标题，简短中文', values: ['喝水', '吃降压药', '起身活动'] },
      { name: 'time', desc: '24 小时制 HH:mm', values: ['06:00', '12:30', '21:00'] },
      { name: 'repeat', desc: '重复规则', values: ['once', 'daily', 'weekly', 'monthly'] },
      { name: 'days', desc: 'weekly 时的星期，逗号分隔，0=周日', values: ['1,3,5', '0,6'] },
      { name: 'category', desc: '分类', values: ['water', 'medication', 'exercise', 'rest', 'work', 'custom'] },
    ],
    exec: true,
    run: async (params) => {
      const title = String(params?.title ?? '').trim();
      const time = String(params?.time ?? '').trim();
      if (!title) return { ok: false, msg: '缺少提醒标题' };
      if (!/^\d{1,2}:\d{2}$/.test(time)) return { ok: false, msg: '时间格式须为 HH:mm' };
      const hhmm = time.padStart(5, '0');
      const repeat = String(params?.repeat ?? 'daily');
      const category = String(params?.category ?? 'custom');
      const rule: CreateReminderInput['repeatRule'] = { type: 'daily' };
      let startDate = new Date().toLocaleDateString('sv-SE');
      let times: string[] | undefined = [hhmm];
      if (repeat === 'once') {
        rule.type = 'once';
        times = undefined;
        startDate = slotIsoToday(hhmm);
      } else if (repeat === 'weekly') {
        rule.type = 'weekly';
        const days = String(params?.days ?? '')
          .split(/[,，\s]+/)
          .map((x) => Number(x))
          .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
        if (days.length > 0) rule.daysOfWeek = days;
      } else if (repeat === 'monthly') {
        rule.type = 'monthly';
        rule.dayOfMonth = new Date().getDate();
      } else {
        rule.type = 'daily';
      }
      try {
        const r = await remindersApi.create({
          category: (['water', 'medication', 'exercise', 'rest', 'work'].includes(category)
            ? category
            : 'custom') as CreateReminderInput['category'],
          title,
          repeatRule: rule,
          startDate,
          times,
          content: { text: '' },
        });
        const rep = repeat === 'once' ? '单次' : repeat === 'daily' ? '每天' : repeat === 'weekly' ? '每周' : '每月';
        notifyDataChanged();
        return { ok: true, msg: `已创建${rep} ${hhmm} 的「${r.title}」提醒` };
      } catch (e) {
        return { ok: false, msg: err(e, '创建失败（检查网络或提醒数量上限）') };
      }
    },
  },
  {
    id: 'reminder.complete',
    desc: '把某条提醒今天的待办槽标记为完成（title: 提醒标题，须与上下文一致；time: 可选 HH:mm，多时段时指定）',
    params: [
      { name: 'title', desc: '提醒标题', values: [] },
      { name: 'time', desc: '可选，多时段提醒的槽位', values: [] },
    ],
    exec: true,
    run: async (params) => {
      const r = await findReminder(params?.title);
      if (!r) return { ok: false, msg: `没找到「${String(params?.title ?? '')}」这条提醒` };
      const slot = await findTodaySlot(r.id, params?.time);
      let scheduledTime: string;
      if (slot) {
        const [hh, mm] = slot.time.split(':').map(Number);
        const now = new Date();
        scheduledTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm).toISOString();
      } else if (!r.times || r.times.length === 0) {
        // 不定时提醒：与今日页 untimedAck 同口径——记录到当日正午
        const now = new Date();
        scheduledTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0).toISOString();
      } else {
        scheduledTime = slotIsoToday(r.times[0]);
      }
      try {
        await remindersApi.ack(r.id, { status: 'completed', scheduledTime });
        notifyDataChanged();
        return { ok: true, msg: `「${r.title}」${slot ? ` ${slot.time} ` : ''}已标记完成` };
      } catch (e) {
        return { ok: false, msg: err(e, '完成失败（可能库存不足或网络问题）') };
      }
    },
  },
  {
    id: 'reminder.delay',
    desc: '延迟某条提醒今天的待办槽（title: 标题；minutes: 延迟分钟数 1~1440，默认 10）',
    params: [
      { name: 'title', desc: '提醒标题', values: [] },
      { name: 'minutes', desc: '分钟数', values: ['5', '10', '30'] },
    ],
    exec: true,
    run: async (params) => {
      const r = await findReminder(params?.title);
      if (!r) return { ok: false, msg: `没找到「${String(params?.title ?? '')}」这条提醒` };
      const minutes = Number(params?.minutes ?? 10);
      if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440)
        return { ok: false, msg: '延迟分钟数须为 1~1440 的整数' };
      try {
        await remindersApi.delay(r.id, minutes);
        notifyDataChanged();
        return { ok: true, msg: `「${r.title}」已延迟 ${minutes} 分钟` };
      } catch (e) {
        return { ok: false, msg: err(e, '延迟失败（可能当前没有待触发槽）') };
      }
    },
  },
  {
    id: 'reminder.skip',
    desc: '放弃某条提醒今天的待办槽（title: 标题）',
    params: [{ name: 'title', desc: '提醒标题', values: [] }],
    exec: true,
    run: async (params) => {
      const r = await findReminder(params?.title);
      if (!r) return { ok: false, msg: `没找到「${String(params?.title ?? '')}」这条提醒` };
      const slot = await findTodaySlot(r.id);
      if (!slot) return { ok: false, msg: `「${r.title}」今天没有待操作的槽位` };
      const [hh, mm] = slot.time.split(':').map(Number);
      const now = new Date();
      try {
        await remindersApi.ack(r.id, {
          status: 'skipped',
          scheduledTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm).toISOString(),
        });
        notifyDataChanged();
        return { ok: true, msg: `「${r.title}」${slot.time} 已放弃（今日页可再改回）` };
      } catch (e) {
        return { ok: false, msg: err(e, '放弃失败') };
      }
    },
  },
  {
    id: 'reminder.delete',
    desc: '删除一条提醒（title: 标题，模糊匹配）',
    params: [{ name: 'title', desc: '提醒标题', values: [] }],
    exec: true,
    run: async (params) => {
      const r = await findReminder(params?.title);
      if (!r) return { ok: false, msg: `没找到「${String(params?.title ?? '')}」这条提醒` };
      try {
        await remindersApi.remove(r.id);
        notifyDataChanged();
        return { ok: true, msg: `已删除「${r.title}」` };
      } catch (e) {
        return { ok: false, msg: err(e, '删除失败') };
      }
    },
  },
  {
    id: 'reminder.toggle',
    desc: '启用/停用一条提醒（title: 标题；value: true 启用 / false 停用）',
    params: [
      { name: 'title', desc: '提醒标题', values: [] },
      { name: 'value', desc: '布尔值', values: ['true', 'false'] },
    ],
    exec: true,
    run: async (params) => {
      const r = await findReminder(params?.title);
      if (!r) return { ok: false, msg: `没找到「${String(params?.title ?? '')}」这条提醒` };
      const active = params?.value !== 'false' && params?.value !== false;
      try {
        await remindersApi.setActive(r.id, active);
        notifyDataChanged();
        return { ok: true, msg: `「${r.title}」已${active ? '启用' : '停用'}` };
      } catch (e) {
        return { ok: false, msg: err(e, '操作失败') };
      }
    },
  },
  {
    id: 'reminder.todayList',
    desc: '查询今天的提醒清单（只读，返回清单文本）',
    exec: true,
    run: async () => {
      const list = await assistantTodayReminders();
      if (list.length === 0) return { ok: true, msg: '今天没有启用的提醒' };
      return {
        ok: true,
        msg: `今天共 ${list.length} 条：${list.map((r) => `${r.time === '不定时' ? r.title : `${r.time} ${r.title}`}`).join('；')}`,
      };
    },
  },
  // ===== 喝水 =====
  {
    id: 'water.add',
    desc: '记录喝水（对应今日页「+200」按钮；value: 毫升数，默认 200）',
    params: [{ name: 'value', desc: '整数毫升', values: ['200', '300', '500'] }],
    exec: true,
    run: async (params) => {
      const ml = Number(params?.value ?? 200);
      if (!Number.isFinite(ml) || ml <= 0 || ml > 10000) return { ok: false, msg: '水量值不合法' };
      try {
        await statsApi.water(ml);
        notifyDataChanged();
        return { ok: true, msg: `已记录喝水 +${ml}ml` };
      } catch (e) {
        return { ok: false, msg: err(e, '记录失败（可能未联网）') };
      }
    },
  },
  // ===== 设置 =====
  {
    id: 'settings.update.notification',
    desc: '切换「提醒通知」开关（value: true/false）',
    params: [{ name: 'value', desc: '布尔值 true 开启 / false 关闭', values: ['true', 'false'] }],
    exec: true,
    run: settingsRun('notificationEnabled'),
  },
  {
    id: 'settings.update.sound',
    desc: '切换「响铃」开关（value: true/false）',
    params: [{ name: 'value', desc: '布尔值', values: ['true', 'false'] }],
    exec: true,
    run: settingsRun('soundEnabled'),
  },
  {
    id: 'settings.update.vibration',
    desc: '切换「震动」开关（value: true/false）',
    params: [{ name: 'value', desc: '布尔值', values: ['true', 'false'] }],
    exec: true,
    run: settingsRun('vibrationEnabled'),
  },
  {
    id: 'settings.update.skipButton',
    desc: '切换提醒「显示跳过按钮」（value: true/false）',
    params: [{ name: 'value', desc: '布尔值', values: ['true', 'false'] }],
    exec: true,
    run: settingsRun('showSkipButton'),
  },
  {
    id: 'settings.update.waterGoal',
    desc: '修改每日喝水目标（value: 毫升数，100~10000）',
    params: [{ name: 'value', desc: '整数毫升', values: ['1500', '2000', '2500'] }],
    exec: true,
    run: settingsRun('waterGoalMl'),
  },
  {
    id: 'settings.update.waterInRate',
    desc: '切换「喝水（当日达标）」是否计入完成率（value: true/false）',
    params: [{ name: 'value', desc: '布尔值', values: ['true', 'false'] }],
    exec: true,
    run: settingsRun('waterCountInRate'),
  },
  // ===== 导航 =====
  {
    id: 'app.navigate',
    desc: '打开应用页面（value: today/reminders/social/plans/medicines/stats/settings）',
    params: [{ name: 'value', desc: '目标页', values: ['today', 'reminders', 'social', 'plans', 'medicines', 'stats', 'settings'] }],
    exec: true,
    run: async (params) => ({ ok: true, msg: `即将打开：${String(params?.value ?? '')}` }),
  },
  {
    id: 'reminder.list',
    desc: '查看提醒——跳转提醒列表页',
    exec: true,
    run: async () => ({ ok: true, msg: '即将打开：提醒列表' }),
  },
  {
    id: 'social.mention',
    desc: '社交功能说明：浏览/点赞/收藏/评论/发布动态、加入计划（涉及网络，建议打开社交页操作）',
    exec: false,
  },
];

/** 目录文本（注入提示词） */
export function catalogText(): string {
  return CATALOG.map(
    (a) =>
      `- ${a.id}：${a.desc}${a.exec ? '' : '（仅说明，不可执行）'}`,
  ).join('\n');
}
