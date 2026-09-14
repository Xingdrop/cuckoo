/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9yZXBvcnRzL3JlcG9ydC1zdGF0cy50c3wyMDI2LTA5fDJhOWZkNTE5MDI= */
/**
 * 周报/月报聚合纯函数（便于单测，UT-STAT-08 周报对比）。
 * 输入为 dayPlan 结构（reminders.service#dayPlan 的 items）。
 */

export interface PlanItem {
  title: string;
  category: string;
  categoryLabel: string | null;
  times: { time: string; status: string | null }[];
}

export interface AggregatedStats {
  planned: number;
  done: number;
  skipped: number;
  missed: number;
  rate: number;
  categoryStats: { name: string; planned: number; done: number; rate: number }[];
  byReminder: { title: string; done: number }[];
}

export function isDoneStatus(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'challenge_completed';
}

/** 把一组 dayPlan 聚合为总览（口径：完成率 = done / planned，skip 不计分母，missed 计入） */
export function aggregatePlans(plans: PlanItem[]): AggregatedStats {
  let planned = 0;
  let done = 0;
  let skipped = 0;
  let missed = 0;
  const catMap = new Map<string, { planned: number; done: number }>();
  const remMap = new Map<string, number>();

  for (const item of plans) {
    for (const t of item.times) {
      if (t.status === 'skipped') {
        skipped += 1;
        continue;
      }
      planned += 1;
      if (t.status === 'missed') missed += 1;
      if (isDoneStatus(t.status)) {
        done += 1;
        remMap.set(item.title, (remMap.get(item.title) ?? 0) + 1);
      }
      const key = item.categoryLabel ?? item.category;
      const c = catMap.get(key) ?? { planned: 0, done: 0 };
      c.planned += 1;
      if (isDoneStatus(t.status)) c.done += 1;
      catMap.set(key, c);
    }
  }

  const categoryStats = [...catMap.entries()]
    .map(([name, c]) => ({
      name,
      ...c,
      rate: c.planned > 0 ? Math.round((c.done / c.planned) * 100) : 0,
    }))
    .sort((a, b) => b.planned - a.planned);

  const byReminder = [...remMap.entries()]
    .map(([title, c]) => ({ title, done: c }))
    .sort((a, b) => b.done - a.done);

  return {
    planned,
    done,
    skipped,
    missed,
    rate: planned > 0 ? Math.round((done / planned) * 100) : 0,
    categoryStats,
    byReminder,
  };
}

/** 建议文案规则（FR-704 下周建议） */
export function buildSuggestion(
  rate: number,
  prevRate: number | null,
  bestCategory: string | null,
): string {
  if (rate >= 90) {
    return bestCategory
      ? `太棒了！「${bestCategory}」继续保持，你是本周的榜样 ✨`
      : '本周完成率出色，继续保持！';
  }
  if (rate >= 70) {
    return bestCategory
      ? `本周表现不错！「${bestCategory}」是你的优势项，把其他类也提上来会更好。`
      : '本周表现稳健，尝试增加一点挑战吧。';
  }
  if (rate >= 40) {
    return '完成率还有提升空间：把大目标拆成小提醒，完成一次就记录一次。';
  }
  if (prevRate !== null && rate < prevRate - 20) {
    return '本周完成率有所下滑：先设定更轻松的节奏，保证"坚持"比"强度"更重要。';
  }
  return '种一棵树最好的时间是现在——从明天早上第一条提醒开始。';
}
