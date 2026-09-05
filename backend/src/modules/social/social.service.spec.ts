/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9zb2NpYWwvc29jaWFsLnNlcnZpY2Uuc3BlYy50c3wyMDI2LTA5fGJjNmJlNjA2YWE= */
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SocialService } from './social.service';
import { AuditService } from '../audit/audit.service';
import { User } from '../users/user.entity';
import { UserSetting } from '../users/user-setting.entity';
import { Reminder } from '../reminders/reminder.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { Medicine } from '../medicines/medicine.entity';
import { EmergencyContact } from '../contacts/emergency-contact.entity';
import { Post } from './post.entity';
import { Interaction } from './interaction.entity';
import { PlanJoinRecord } from './plan-join-record.entity';
import { PlanTemplate } from './plan-template.entity';
import { SensitiveWord } from './sensitive-word.entity';
import { Follow } from './follow.entity';
import { Notification } from '../notifications/notification.entity';
import { NotificationLog } from '../notifications/notification-log.entity';
import { Device } from '../notifications/device.entity';
import { Exercise } from '../exercises/exercise.entity';
import { AuditLog } from '../audit/audit-log.entity';
import { Report } from '../reports/report.entity';
import { Achievement, AchievementRule } from '../achievements/achievement.entity';
import { Plan } from '../plans/plan.entity';
import { PlansService } from '../plans/plans.service';

/**
 * 一键加入计划单测（UT-JOIN-01~06，in-memory SQLite 真实事务）。
 * 实体全量注册（来源 app.module.ts），否则事务/外键会运行时报错。
 */
describe('SocialService（UT-JOIN）', () => {
  let service: SocialService;
  let dataSource: DataSource;
  let postRepo: ReturnType<DataSource['getRepository']>;
  let reminderRepo: ReturnType<DataSource['getRepository']>;
  let joinRepo: ReturnType<DataSource['getRepository']>;
  let planRepo: ReturnType<DataSource['getRepository']>;
  let userRepo: ReturnType<DataSource['getRepository']>;

  const USER_A = 'user-a';
  const USER_B = 'user-b';

  const SNAPSHOT = {
    version: 1,
    reminders: [
      {
        category: 'water',
        title: '喝水',
        repeatRule: { type: 'daily' },
        times: ['09:00'],
        startTime: '09:00',
        content: {},
      },
    ],
  };

  const makePlanPost = (content: string, reminders: unknown[]) =>
    service.createPost(USER_A, { content, planSnapshot: { version: 1, reminders } });  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [
        User, UserSetting, Reminder, ReminderLog, Medicine, EmergencyContact,
        Post, Interaction, PlanJoinRecord, PlanTemplate, SensitiveWord,
        Follow,
        Notification, NotificationLog, Device, Exercise,
        AuditLog, Report, Achievement, AchievementRule, Plan,
      ],
      synchronize: true,
    });
    await dataSource.initialize();

    postRepo = dataSource.getRepository(Post);
    reminderRepo = dataSource.getRepository(Reminder);
    joinRepo = dataSource.getRepository(PlanJoinRecord);
    planRepo = dataSource.getRepository(Plan);
    userRepo = dataSource.getRepository(User);
    const interactionRepo = dataSource.getRepository(Interaction);
    const templateRepo = dataSource.getRepository(PlanTemplate);
    const sensitiveWordRepo = dataSource.getRepository(SensitiveWord);
    const followRepo = dataSource.getRepository(Follow);
    const logRepo = dataSource.getRepository(ReminderLog);

    const module = await Test.createTestingModule({
      providers: [
        SocialService,
        { provide: getRepositoryToken(Post), useValue: postRepo },
        { provide: getRepositoryToken(Interaction), useValue: interactionRepo },
        { provide: getRepositoryToken(PlanJoinRecord), useValue: joinRepo },
        { provide: getRepositoryToken(PlanTemplate), useValue: templateRepo },
        { provide: getRepositoryToken(Reminder), useValue: reminderRepo },
        { provide: getRepositoryToken(SensitiveWord), useValue: sensitiveWordRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Plan), useValue: planRepo },
        { provide: getRepositoryToken(Follow), useValue: followRepo },
        { provide: getRepositoryToken(ReminderLog), useValue: logRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = module.get(SocialService);

    await userRepo.save(
      userRepo.create({ id: USER_A, username: 'alice', passwordHash: 'x' }),
    );
    await userRepo.save(
      userRepo.create({ id: USER_B, username: 'bob', passwordHash: 'x' }),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('UT-JOIN-01 正常加入 → 保存计划+配置（不建提醒）+ 加入记录 + count+1', async () => {
    const post = await makePlanPost('分享喝水计划', SNAPSHOT.reminders);
    const r = await service.joinPlan(USER_B, post.id);
    expect(r).toMatchObject({ joined: true, duplicate: false });

    // Plan（sourceType share）落库，isActive=false（等用户在计划页开启）
    const plans = await planRepo.find({
      where: { userId: USER_B, sourceType: 'share', sourceId: post.id },
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].isActive).toBe(false);
    // #18：提醒配置保存到 plan.config，不直接创建提醒
    expect(plans[0].config).toHaveLength(1);
    expect((plans[0].config as Record<string, unknown>[])[0].category).toBe('water');
    expect((plans[0].config as Record<string, unknown>[])[0].title).toBe('喝水');
    expect(await reminderRepo.count({ where: { planId: plans[0].id, userId: USER_B } })).toBe(0);

    // PlanJoinRecord 关联（reminderId 字段存计划 id）
    const join = await joinRepo.findOne({ where: { postId: post.id, userId: USER_B } });
    expect(join?.isActive).toBe(true);
    expect(join?.reminderId).toBe(plans[0].id);

    // count +1
    const updated = await postRepo.findOne({ where: { id: post.id } });
    expect(updated?.joinedCount).toBe(1);
  });

  it('UT-JOIN-02 重复加入 → duplicate:true 且 count 不变', async () => {
    const post = await makePlanPost('重复加入帖子', SNAPSHOT.reminders);
    const first = await service.joinPlan(USER_B, post.id);
    const second = await service.joinPlan(USER_B, post.id);
    expect(second.duplicate).toBe(true);
    expect(second.planId).toBe(first.planId);
    const p = await postRepo.findOne({ where: { id: post.id } });
    expect(p?.joinedCount).toBe(1);
  });

  it('UT-JOIN-03 加入后退出（leavePlan）→ join.isActive=false + 计划删除 + count-1', async () => {
    const post = await makePlanPost('加入后退出帖子', SNAPSHOT.reminders);
    await service.joinPlan(USER_B, post.id);
    expect((await postRepo.findOne({ where: { id: post.id } }))?.joinedCount).toBe(1);

    const leave = await service.leavePlan(USER_B, post.id);
    expect(leave).toEqual({ left: true });

    const join = await joinRepo.findOne({ where: { postId: post.id, userId: USER_B } });
    expect(join?.isActive).toBe(false);
    // #18：退出 = 从「我的计划」移除（计划已删除，未创建过提醒）
    const plan = await planRepo.findOne({ where: { id: join!.reminderId, userId: USER_B } });
    expect(plan).toBeNull();
    expect((await postRepo.findOne({ where: { id: post.id } }))?.joinedCount).toBe(0);
  });

  it('UT-JOIN-04 快照校验失败 → 抛 BadRequest 且无副作用（count 不变、无 join 记录）', async () => {
    // 无 planSnapshot
    const noSnap = await service.createPost(USER_A, { content: '无快照的帖子' });
    await expect(service.joinPlan(USER_B, noSnap.id)).rejects.toBeInstanceOf(BadRequestException);
    expect((await postRepo.findOne({ where: { id: noSnap.id } }))?.joinedCount).toBe(0);
    expect(await joinRepo.count({ where: { postId: noSnap.id } })).toBe(0);

    // 空 reminders（注意：实现会在抛出前先落 plan，但不写 join 也不累计 count）
    // 2026-08：createPost 已禁止空计划发帖 → 直接入库模拟历史帖子
    const empty = await postRepo.save(
      postRepo.create({
        id: crypto.randomUUID(),
        userId: USER_A,
        type: 'user_plan',
        content: '空提醒帖子（历史数据）',
        mediaUrls: [],
        planSnapshot: { version: 1, reminders: [] },
        joinedCount: 0,
        likesCount: 0,
        commentsCount: 0,
      }),
    );
    await expect(service.joinPlan(USER_B, empty.id)).rejects.toBeInstanceOf(BadRequestException);
    expect((await postRepo.findOne({ where: { id: empty.id } }))?.joinedCount).toBe(0);
    expect(await joinRepo.count({ where: { postId: empty.id } })).toBe(0);
  });

  it('UT-JOIN-05 快照 reminders 缺 category/title → 使用默认值保存配置', async () => {
    const post = await makePlanPost('默认值帖子', [
      { repeatRule: { type: 'daily' }, times: ['09:00'], startTime: '09:00', content: {} },
    ]);
    const r = await service.joinPlan(USER_B, post.id);
    expect(r.joined).toBe(true);
    const plan = await planRepo.findOne({ where: { id: r.planId, userId: USER_B } });
    const first = (plan?.config as Record<string, unknown>[])[0];
    expect(first.category).toBe('custom');
    expect(first.title).toBe('加入的计划');
    expect(first.times).toEqual(['09:00']);
  });

  it('UT-JOIN-06 越权：另一用户 join 他人公开帖子 → 成功（设计如此：join 不检查作者归属）', async () => {
    // 帖子公开，joinPlan 无作者归属校验 → 非作者也可加入（标注：设计如此）
    const post = await makePlanPost('公开计划帖子', SNAPSHOT.reminders);
    const r = await service.joinPlan(USER_B, post.id);
    expect(r).toMatchObject({ joined: true, duplicate: false });
    const p = await postRepo.findOne({ where: { id: post.id } });
    expect(p?.joinedCount).toBe(1);
  });

  it('UT-PLAN-01 计划开关：开启 = 按配置重建提醒，关闭 = 清除全部相关提醒（#18）', async () => {
    const post = await makePlanPost('开关联动帖子', SNAPSHOT.reminders);
    const r = await service.joinPlan(USER_B, post.id);
    const plans = new PlansService(planRepo as never, reminderRepo as never, dataSource);

    // 加入后：无提醒，计划未启用
    const plan = await planRepo.findOne({ where: { id: r.planId, userId: USER_B } });
    expect(plan?.isActive).toBe(false);
    expect(await reminderRepo.count({ where: { planId: plan!.id } })).toBe(0);

    // 开启 → 创建 1 条提醒（isActive=true，planId 关联）
    await plans.setActive(USER_B, plan!.id, true);
    const afterOn = await reminderRepo.find({ where: { planId: plan!.id } });
    expect(afterOn).toHaveLength(1);
    expect(afterOn[0].isActive).toBe(true);
    expect(afterOn[0].title).toBe('喝水');

    // 关闭 → 全部相关提醒被清除（配置保留）
    await plans.setActive(USER_B, plan!.id, false);
    expect(await reminderRepo.count({ where: { planId: plan!.id } })).toBe(0);
    const planAfter = await planRepo.findOne({ where: { id: plan!.id } });
    expect((planAfter?.config as Record<string, unknown>[]).length).toBe(1);

    // 再次开启 → 重新创建（reminderId 记录到 config）
    await plans.setActive(USER_B, plan!.id, true);
    const afterRe = await reminderRepo.find({ where: { planId: plan!.id } });
    expect(afterRe).toHaveLength(1);
    const cfg = (await planRepo.findOne({ where: { id: plan!.id } }))?.config as Record<string, unknown>[];
    expect(cfg[0].reminderId).toBe(afterRe[0].id);
  });
});
