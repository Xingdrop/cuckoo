import { aggregatePlans, buildSuggestion } from './report-stats';
import type { PlanItem } from './report-stats';

describe('报表聚合（UT-STAT-08 周报对比）', () => {
  const plans: PlanItem[] = [
    {
      title: '喝水',
      category: 'water',
      categoryLabel: '喝水',
      times: [
        { time: '08:00', status: 'completed' },
        { time: '12:00', status: 'completed' },
        { time: '20:00', status: 'skipped' },
      ],
    },
    {
      title: '吃药',
      category: 'medication',
      categoryLabel: '吃药',
      times: [
        { time: '09:00', status: 'completed' },
        { time: '21:00', status: 'missed' },
      ],
    },
  ];

  it('完成率口径：skip 不计分母，missed 计入', () => {
    const s = aggregatePlans(plans);
    expect(s.planned).toBe(4); // 2 water(done) + 2 med(1 done + 1 missed)，skip 不算
    expect(s.done).toBe(3);
    expect(s.skipped).toBe(1);
    expect(s.missed).toBe(1);
    expect(s.rate).toBe(75);
  });

  it('分类统计与最佳提醒', () => {
    const s = aggregatePlans(plans);
    expect(s.categoryStats).toHaveLength(2);
    const water = s.categoryStats.find((c) => c.name === '喝水')!;
    expect(water).toMatchObject({ planned: 2, done: 2, rate: 100 });
    expect(s.byReminder).toEqual([{ title: '喝水', done: 2 }, { title: '吃药', done: 1 }]);
  });

  it('空计划 → 全零', () => {
    const s = aggregatePlans([]);
    expect(s).toMatchObject({ planned: 0, done: 0, rate: 0 });
  });

  it('建议文案规则（>=90 / 70-89 / 40-69 / 下滑 / 兜底）', () => {
    expect(buildSuggestion(95, 90, '喝水')).toContain('喝水');
    expect(buildSuggestion(75, 70, null)).toContain('稳健');
    expect(buildSuggestion(50, 60, null)).toContain('提升空间');
    expect(buildSuggestion(30, 80, null)).toContain('下滑');
    expect(buildSuggestion(10, null, null)).toContain('现在');
  });

  it('UT-STAT-08 周报对比：本周速率对比上周（aggregatePlans）', () => {
    // 上周：2 完成 / 1 漏服 → planned=3, done=2, rate=67
    const lastWeek: PlanItem[] = [
      {
        title: '喝水',
        category: 'water',
        categoryLabel: '喝水',
        times: [
          { time: '08:00', status: 'completed' },
          { time: '12:00', status: 'completed' },
          { time: '20:00', status: 'missed' },
        ],
      },
    ];
    // 本周：3 完成 / 1 跳过 → planned=3, done=3, rate=100
    const thisWeek: PlanItem[] = [
      {
        title: '喝水',
        category: 'water',
        categoryLabel: '喝水',
        times: [
          { time: '08:00', status: 'completed' },
          { time: '12:00', status: 'completed' },
          { time: '18:00', status: 'completed' },
          { time: '21:00', status: 'skipped' },
        ],
      },
    ];
    const last = aggregatePlans(lastWeek);
    const curr = aggregatePlans(thisWeek);
    expect(last.rate).toBe(67);
    expect(curr.rate).toBe(100);
    // 周报对比语义：本周好于上周
    expect(curr.rate).toBeGreaterThan(last.rate);
  });
});
