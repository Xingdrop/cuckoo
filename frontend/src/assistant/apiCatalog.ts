import { authApi } from '../services/api/api.auth';
import { statsApi } from '../services/api/api.stats';
import { useGuestStore } from '../guest/guestStore';
import { useLocal } from '../guest/localMode';

/**
 * #26：语音助手——按钮 → API 目录。
 * 汇总「今日/提醒/社交/设置」各界面按钮对应的后端能力，
 * 提示词由助理把用户语音匹配到目录动作并返回 JSON 执行计划。
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

/** 当前上下文（注入提示词，让 AI 调用具体数字） */
export function assistantContext() {
  const local = useLocal();
  const s = useGuestStore.getState().settings;
  const water = local ? useGuestStore.getState().todayWater() : 0;
  return {
    mode: local ? '离线' : '在线',
    notificationEnabled: s.notificationEnabled,
    soundEnabled: s.soundEnabled,
    vibrationEnabled: s.vibrationEnabled,
    showSkipButton: s.showSkipButton === true,
    waterGoalMl: s.waterGoalMl ?? 2000,
    waterCountInRate: s.waterCountInRate === true,
    todayWaterMl: local ? water : '由服务端统计',
  };
}

const settingsRun =
  (key: keyof ReturnType<typeof assistantContext>) =>
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
        return { ok: true, msg: `已记录喝水 +${ml}ml` };
      } catch (e) {
        return { ok: false, msg: '记录失败（可能未联网）' };
      }
    },
  },
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
