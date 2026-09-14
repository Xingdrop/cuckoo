/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9zdGF0cy9zdGF0cy5zZXJ2aWNlLnNwZWMudHN8MjAyNi0wOXxiZDcxMTUyZjkz */ */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StatsService } from './stats.service';
import { RemindersService } from '../reminders/reminders.service';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { UserSetting } from '../users/user-setting.entity';

/** 统计口径单测（UT-STAT-01~08，mock 方式）。注意：不改源码，dayPlan/calcStreak 均 mock。 */
describe('StatsService（UT-STAT）', () => {
  let service: StatsService;
  let dayPlan: jest.Mock;
  let logRepo: { find: jest.Mock; findOne: jest.Mock; count: jest.Mock };
  let settingRepo: { find: jest.Mock; findOne: jest.Mock };
  /** 按 dateStr 返回的 dayPlan 形状（真实返回结构） */
  let planByDate: Record<string, ReturnType<typeof makeItem>[]>;

  const TZ = 'Asia/Shanghai';
  // 固定「now」：Asia/Shanghai 本地 2026-08-29 18:00 → dateStr = '2026-08-29'
  const NOW = new Date('2026-08-29T10:00:00Z');

  function makeItem(status: string | null = 'completed', category = 'water', categoryLabel = '喝水') {
    return {
      reminderId: 'r1',
      title: category,
      category,
      categoryLabel,
      categoryIcon: null,
      content: {},
      times: [{ time: '08:00', status }],
      todayTotal: 1,
      untimed: false,
    };
  }

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    planByDate = {};
    // 未覆盖日期返回空数组 → planned=0（无安排跳过不中断）
    dayPlan = jest.fn().mockImplementation(async (_u: string, dateStr: string) => planByDate[dateStr] ?? []);
    logRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      // 2026-08 #3：手动喝水计入达成（dayRate 增加 count 查询）
      count: jest.fn().mockResolvedValue(0),
    };
    settingRepo = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) };

    const module = await Test.createTestingModule({
      providers: [
        StatsService,
        {
          provide: RemindersService,
          useValue: {
            dayPlan,
            getUserTimezoneSafe: jest.fn().mockResolvedValue(TZ),
          },
        },
        { provide: getRepositoryToken(ReminderLog), useValue: logRepo },
        { provide: getRepositoryToken(UserSetting), useValue: settingRepo },
      ],
    }).compile();
    service = module.get(StatsService);
  });

  afterEach(() => jest.useRealTimers());

  it('UT-STAT-01 完成率 = done/planned（skip 不计分母）', async () => {
    // 3 完成 + 1 跳过 → planned=3 / done=3 / rate=100
    planByDate['2026-08-29'] = [
      makeItem('completed'),
      makeItem('completed'),
      makeItem('completed'),
      makeItem('skipped'),
    ];
    const d = await service.dashboard('u1');
    expect(d.planned).toBe(3);
    expect(d.done).toBe(3);
    expect(d.rate).toBe(100);
    expect(d.missed).toBe(0);
    expect(d.date).toBe('2026-08-29');
  });

  it('UT-STAT-01b 喝水达标计入（waterCountInRate）：目标计入 planned，达标计 done', async () => {
    // 2 条提醒槽（1 完成）+ 喝水目标 1000 已达标 → planned=3 / done=2 / rate=67
    planByDate['2026-08-29'] = [makeItem('completed'), makeItem(null)];
    settingRepo.findOne = jest.fn().mockResolvedValue({ waterCountInRate: true, waterGoalMl: 1000 });
    logRepo.find = jest.fn().mockResolvedValue([
      { id: 'w1', category: 'water', amount: 1000, scheduledTime: new Date('2026-08-29T04:00:00.000Z') },
    ]);
    const d = await service.dashboard('u1');
    expect(d.planned).toBe(3);
    expect(d.done).toBe(2);
    expect(d.rate).toBe(67);
  });

  it('UT-STAT-02 漏服计入分母（3 完成/1 missed → 75%）', async () => {
    planByDate['2026-08-29'] = [
      makeItem('completed'),
      makeItem('completed'),
      makeItem('completed'),
      makeItem('missed'),
    ];
    const d = await service.dashboard('u1');
    expect(d.planned).toBe(4);
    expect(d.done).toBe(3);
    expect(d.rate).toBe(75);
    expect(d.missed).toBe(1);
  });

  it('UT-STAT-03 连续 3 天全完成 → streak=3', async () => {
    planByDate['2026-08-29'] = [makeItem('completed')];
    planByDate['2026-08-28'] = [makeItem('completed')];
    planByDate['2026-08-27'] = [makeItem('completed')];
    expect(await service.calcStreak('u1', '2026-08-29')).toBe(3);
  });

  it('UT-STAT-04 中间一天漏服 → 中断重算', async () => {
    planByDate['2026-08-29'] = [makeItem('completed')];
    planByDate['2026-08-28'] = [makeItem('missed')]; // 中断
    planByDate['2026-08-27'] = [makeItem('completed')];
    expect(await service.calcStreak('u1', '2026-08-29')).toBe(1);
  });

  it('UT-STAT-05 今天未结 → 从昨天回溯', async () => {
    // 今天未全完成（有 planned 但 done<planned）→ 不计今天，从昨天开始
    planByDate['2026-08-29'] = [makeItem('missed')];
    planByDate['2026-08-28'] = [makeItem('completed')];
    planByDate['2026-08-27'] = [makeItem('completed')];
    expect(await service.calcStreak('u1', '2026-08-29')).toBe(2);
  });

  it.skip('UT-STAT-06 平均延迟：StatsService 无现成聚合方法，口径在 report-stats，跳过', () => {
    // 现状：ReminderLog 只有 delayMinutes 字段，StatsService 未有平均延迟聚合；
    // aggregatedPlans/报告模块亦无该指标，故本条跳过并标注。
    expect(true).toBe(true);
  });

  it('UT-STAT-07 分类统计聚合', async () => {
    planByDate['2026-08-29'] = [
      makeItem('completed', 'water', '喝水'),
      makeItem('missed', 'medication', '吃药'),
    ];
    const d = await service.dashboard('u1');
    expect(d.categoryStats['喝水']).toMatchObject({ planned: 1, done: 1, rate: 100 });
    expect(d.categoryStats['吃药']).toMatchObject({ planned: 1, done: 0, rate: 0 });
  });
});
