/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL2Fzc2lzdGFudC9hc3Npc3RhbnQudHN8MjAyNi0wOXw3NDM0N2Y1MjIw */
/**
 * #26：AI 助手——配置（本地保密存储，key 不上传服务器）与编排：
 * 语音文本 + API 目录 + 上下文 → 用户自配的 OpenAI 兼容接口 → JSON 动作 → 本地执行并逐条汇报。
 */

export interface AiConfig {
  enabled: boolean;
  /** OpenAI 兼容接口，如 https://api.openai.com/v1 */
  baseUrl: string;
  apiKey: string;
  model: string;
}

const STORAGE_KEY = 'cuckoo_ai_config';

export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { enabled: false, baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', ...JSON.parse(raw) };
  } catch {
    /* 忽略损坏数据 */
  }
  return { enabled: false, baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' };
}

export function saveAiConfig(cfg: AiConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

/** 参数中文名（预案面板「将要」列表用；未列出的键原样显示） */
const PARAM_LABEL: Record<string, string> = {
  title: '标题', time: '时间', times: '时间', repeat: '重复', repeatRule: '重复',
  days: '星期', daysOfWeek: '星期', category: '分类', amountMl: '水量',
  text: '内容', note: '备注', date: '日期', minutes: '分钟', duration: '时长',
  medicineName: '药品', count: '数量', goalMl: '目标', enabled: '启用', planId: '计划',
};

/** 内部/撤回用参数不展示（对用户无意义） */
const PARAM_SKIP = new Set(['at', 'id', 'logId', 'reminderId', 'slot', 'scheduledTime', 'undo', 'photoUrl']);

/** 动作参数 → 一行可读预览（供确认面板展示「将要做什么」） */
export function previewParams(params?: Record<string, unknown>): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || PARAM_SKIP.has(k)) continue;
    const val = Array.isArray(v) ? v.join('/') : typeof v === 'object' ? '' : String(v);
    if (!val) continue;
    parts.push(`${PARAM_LABEL[k] ?? k}：${val}`);
    if (parts.length >= 4) break;
  }
  return parts.join(' · ');
}

export interface StepReport {  /** 识别/语音文本 */
  say: string;
  /** 修改动作描述 */
  act: string;
  /** 修改结果 */
  result: string;
  /** 步骤类型：input=输入来源说明（非待执行动作，确认面板不列为「将要」）；缺省=实际动作 */
  kind?: 'input' | 'action';
}

export interface AssistantOutcome {
  reply: string;
  steps: StepReport[];
  error?: string;
  /** dryRun 模式：未执行的原始动作（确认后交 executePending） */
  pendingActions?: { id: string; params: Record<string, unknown> }[];
  /** 已执行动作的撤回信息（逆序执行即撤回；executePending 返回） */
  undo?: { id: string; params: Record<string, unknown> }[];
}

/**
 * 执行 AI 返回的 JSON 计划：{"reply":"...","actions":[{"id":"..","params":{..}}]}
 * 每个动作独立执行并返回「动作→结果」，供界面逐条提示。
 */
/** 多轮对话历史（user/assistant 交替；由调用方维护与截断） */
export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export async function runAssistant(
  rawText: string,
  opts: { autoRun?: boolean; history?: HistoryTurn[]; inputSource?: 'voice' | 'type' } = { autoRun: true },
): Promise<AssistantOutcome> {
  /** 输入来源文案（2026-09-14：新增打字输入，不再一律写「语音识别」） */
  const inputLabel = opts.inputSource === 'type' ? '打字输入' : '语音识别';
  const cfg = loadAiConfig();
  if (!cfg.apiKey || !cfg.baseUrl) {
    return {
      reply: '请先在「设置 → 语音助手」中填写 AI API 地址与密钥（仅存储在本机）',
      steps: [{ say: rawText, act: '未配置 AI API', result: '无法调用' }],
      error: 'AI_API_NOT_CONFIGURED',
    };
  }
  const { CATALOG, catalogText, assistantContext, assistantTodayReminders, assistantWaterProgress } = await import('./apiCatalog');
  const ctx = assistantContext();
  const [todayReminders, water] = await Promise.all([assistantTodayReminders(), assistantWaterProgress()]);
  const sys = `你是「布谷」健康提醒应用的语音助手。用户说一句话，你判断要执行的动作。
可选动作目录（只能返回目录中的 id，params 取值参考目录）：
${catalogText()}

当前上下文（JSON）：
${JSON.stringify({ ...ctx, water })}

用户当前的提醒（title/time/status）：
${todayReminders.length > 0 ? JSON.stringify(todayReminders) : '（暂无提醒）'}

规则：
- 用户输入来自**语音识别（ASR）**，可能存在同音字/错别字/断句错误（例如把提醒标题「吃早饭」识别成别的词）。匹配 title 时请在上下文清单中选择**发音或字面最接近**的一项，并在 params.title 里使用清单中的原标题；确实无法对应时不要执行，reply 礼貌询问
- 回复时对明显的识别错别字做合理联想与纠正，不必逐字复述识别原文
- 只输出一个 JSON 对象，不要任何多余文字：{"reply":"对用户说的一句话","actions":[{"id":"动作id","params":{...}}]}
- **支持一次执行多项任务**：用户一句话里包含多件事时，按顺序拆解为多个动作（最多 5 项），如「订一个每天七点喝水的提醒，再记 200 毫升水」→ reminder.create + water.add；reply 概括全部将执行的内容
- 无法匹配时 actions 为空数组，reply 说明原因
- 数值类参数必须给具体数字（如喝水 250、目标 2500、延迟 15）
- reminder.create：用户想新建/订/加提醒时使用；time 转成 24 小时制 HH:mm；「每天」→ repeat daily，「X 点」未说重复且属提醒场景默认 daily，明确「一次/明天/后天」→ once；周几 → weekly 并给 days（0=周日）
- reminder.complete/delay/skip/delete/toggle：title 必须与「用户当前的提醒」里的标题完全一致；多时段提醒用户指明了时刻时给 time（HH:mm）
- 涉及「社交/发布/点赞」等目录标记为不可执行的动作不要放到 actions`;
  let content = '';
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: sys },
          ...(Array.isArray(opts.history) ? opts.history.slice(-6) : []),
          { role: 'user', content: rawText },
        ],
        temperature: 0.2,
        stream: false,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { reply: '调用 AI 失败（请检查 API 配置）', steps: [{ say: rawText, act: 'AI 调用', result: `HTTP ${res.status}` }], error: t.slice(0, 120) };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    content = data.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    return { reply: '网络请求失败（检查网络或 API 地址）', steps: [{ say: rawText, act: 'AI 调用', result: String(e).slice(0, 80) }], error: String(e).slice(0, 100) };
  }

  // 解析 JSON（容忍 ```json 包裹）
  let plan: { reply?: string; actions?: { id: string; params?: Record<string, unknown> }[] } = {};
  try {
    const m = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
    plan = JSON.parse(m ? m[1] : content);
  } catch {
    return {
      reply: 'AI 返回无法解析，请重试',
      steps: [{ say: rawText, act: '解析', result: content.slice(0, 100) }],
      error: 'PARSE_FAIL',
    };
  }

  const steps: StepReport[] = [{ say: rawText, act: inputLabel, result: '已提交', kind: 'input' }];
  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  // dryRun：只返回预案（供用户确认），不执行
  if (opts.autoRun === false) {
    const pending = actions.slice(0, 5).filter((a): a is { id: string; params: Record<string, unknown> } => {
      const def = CATALOG.find((c) => c.id === a.id);
      return Boolean(def?.exec && def.run);
    });
    // 预案必须让用户看清"将要做什么"：把每个待执行动作连同参数预览一并列出
    for (const a of pending) {
      const def = CATALOG.find((c) => c.id === a.id);
      steps.push({
        say: '',
        act: def ? def.desc.split('（')[0] : a.id,
        result: previewParams(a.params),
        kind: 'action',
      });
    }
    return {
      reply: plan.reply?.slice(0, 200) ?? '好的，已为你处理。',
      steps,
      pendingActions: pending,
    };
  }
  for (const a of actions.slice(0, 5)) {
    const def = CATALOG.find((c) => c.id === a.id);
    if (!def || !def.exec || !def.run) {
      steps.push({ say: '', act: a.id, result: '不支持（未在目录中允许执行）' });
      continue;
    }
    try {
      const r = await def.run(a.params ?? {});
      steps.push({ say: '', act: def.desc.split('（')[0], result: r.msg });
    } catch (e) {
      steps.push({ say: '', act: a.id, result: `执行失败：${String(e).slice(0, 60)}` });
    }
  }
  if (actions.length === 0) steps.push({ say: '', act: '未执行修改', result: '仅说明' });

  return { reply: plan.reply?.slice(0, 200) ?? '好的，已为你处理。', steps };
}

/** 确认后执行预案动作（语音助手 v2：松手出预案 → 确认执行） */
export async function executePending(
  actions: { id: string; params: Record<string, unknown> }[],
  rawText: string,
  inputSource: 'voice' | 'type' = 'voice',
): Promise<AssistantOutcome> {
  const steps: StepReport[] = [
    { say: rawText, act: inputSource === 'type' ? '打字输入' : '语音识别', result: '已提交', kind: 'input' },
  ];
  const undo: NonNullable<AssistantOutcome['undo']> = [];
  const { CATALOG } = await import('./apiCatalog');
  for (const a of actions.slice(0, 5)) {
    const def = CATALOG.find((c) => c.id === a.id);
    if (!def?.exec || !def.run) {
      steps.push({ say: '', act: a.id, result: '不支持（未在目录中允许执行）' });
      continue;
    }
    try {
      const r = await def.run(a.params ?? {});
      if (r.undo) undo.push(...r.undo);
      steps.push({ say: '', act: def.desc.split('（')[0], result: r.msg });
    } catch (e) {
      steps.push({ say: '', act: a.id, result: `执行失败：${String(e).slice(0, 60)}` });
    }
  }
  if (actions.length === 0) steps.push({ say: '', act: '未执行修改', result: '仅说明' });
  return { reply: '已按确认完成调整。', steps, undo };
}

export function speechSupported(): boolean {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}
