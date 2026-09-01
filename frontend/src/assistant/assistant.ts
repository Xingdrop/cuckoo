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

export interface StepReport {
  /** 识别/语音文本 */
  say: string;
  /** 修改动作描述 */
  act: string;
  /** 修改结果 */
  result: string;
}

export interface AssistantOutcome {
  reply: string;
  steps: StepReport[];
  error?: string;
}

/**
 * 执行 AI 返回的 JSON 计划：{"reply":"...","actions":[{"id":"..","params":{..}}]}
 * 每个动作独立执行并返回「动作→结果」，供界面逐条提示。
 */
export async function runAssistant(rawText: string): Promise<AssistantOutcome> {
  const cfg = loadAiConfig();
  if (!cfg.apiKey || !cfg.baseUrl) {
    return {
      reply: '请先在「设置 → 语音助手」中填写 AI API 地址与密钥（仅存储在本机）',
      steps: [{ say: rawText, act: '未配置 AI API', result: '无法调用' }],
      error: 'AI_API_NOT_CONFIGURED',
    };
  }
  const { CATALOG, catalogText, assistantContext } = await import('./apiCatalog');
  const ctx = assistantContext();
  const sys = `你是「布谷」健康提醒应用的语音助手。用户说一句话，你判断要执行的动作。
可选动作目录（只能返回目录中的 id，params 取值参考目录）：
${catalogText()}

当前上下文（JSON）：
${JSON.stringify(ctx)}

规则：
- 只输出一个 JSON 对象，不要任何多余文字：{"reply":"对用户说的一句话","actions":[{"id":"动作id","params":{...}}]}
- 无法匹配时 actions 为空数组，reply 说明原因
- 数值类参数必须给具体数字（如喝水 250、目标 2500）
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

  const steps: StepReport[] = [{ say: rawText, act: '语音识别', result: '已识别' }];
  const actions = Array.isArray(plan.actions) ? plan.actions : [];
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

export function speechSupported(): boolean {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}
