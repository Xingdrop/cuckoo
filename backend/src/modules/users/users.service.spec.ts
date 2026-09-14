/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy91c2Vycy91c2Vycy5zZXJ2aWNlLnNwZWMudHN8MjAyNi0wOXwzZWIyNmZhNzI5 */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { UserSetting } from './user-setting.entity';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { Reminder } from '../reminders/reminder.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { Medicine } from '../medicines/medicine.entity';
import { Plan } from '../plans/plan.entity';
import { Post } from '../social/post.entity';
import { SensitiveWord } from '../social/sensitive-word.entity';

/**
 * UT-SEC-02（2026-09-14 安全修复）：离线数据导入不得跨租户读写。
 *
 * 事故：mergeRows 只按裸 id 查/改云端行，任何人构造
 * `{ id: <他人帖子id>, updatedAt: '9999-01-01' }` 即可把他人帖子/提醒改写成自己的
 * （公开的 GET /posts 就能拿到他人帖子 id）。
 */
describe('UsersService（UT-SEC 跨租户导入）', () => {
  let service: UsersService;
  let dataSource: DataSource;
  let postRepo: ReturnType<DataSource['getRepository']>;
  let reminderRepo: ReturnType<DataSource['getRepository']>;

  const VICTIM = 'victim-user';
  const ATTACKER = 'attacker-user';

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [User, UserSetting, Reminder, ReminderLog, Medicine, Plan, Post, SensitiveWord],
      synchronize: true,
    });
    await dataSource.initialize();
    postRepo = dataSource.getRepository(Post);
    reminderRepo = dataSource.getRepository(Reminder);

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: dataSource.getRepository(User) },
        { provide: getRepositoryToken(UserSetting), useValue: dataSource.getRepository(UserSetting) },
        { provide: AuthService, useValue: {} },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(UsersService);

    await dataSource.getRepository(User).save([
      dataSource.getRepository(User).create({ id: VICTIM, username: 'victim', passwordHash: 'x' }),
      dataSource.getRepository(User).create({ id: ATTACKER, username: 'attacker', passwordHash: 'x' }),
    ]);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('UT-SEC-02 用他人帖子 id 导入 → 不覆盖他人数据（跳过而非改写）', async () => {
    const victimPost = await postRepo.save(
      postRepo.create({ id: 'post-victim', userId: VICTIM, content: '受害者原帖', type: 'user_plan' as never }),
    );

    const res = await service.importData(ATTACKER, {
      posts: [
        {
          id: victimPost.id,
          userId: VICTIM, // 冒充属主
          content: '被改写成攻击者的内容',
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '9999-01-01T00:00:00.000Z', // 远晚于云端 → 旧实现会被覆盖
        },
      ],
    });

    const after = await postRepo.findOneOrFail({ where: { id: victimPost.id } });
    expect(after.userId).toBe(VICTIM);
    expect(after.content).toBe('受害者原帖');
    expect(res.imported.posts).toMatchObject({ imported: 0, skipped: 1 });
  });

  it('UT-SEC-02b 用他人提醒 id 导入 → 不覆盖（提醒同理）', async () => {
    const victimReminder = await reminderRepo.save(
      reminderRepo.create({
        id: 'rem-victim',
        userId: VICTIM,
        title: '受害者的提醒',
        category: 'water' as never,
        repeatRule: { type: 'daily' } as never,
        startDate: new Date('2026-01-01'),
      }),
    );

    await service.importData(ATTACKER, {
      reminders: [
        {
          id: victimReminder.id,
          userId: VICTIM,
          title: '被改写',
          updatedAt: '9999-01-01T00:00:00.000Z',
          startDate: '2026-01-01',
        },
      ],
    });

    const after = await reminderRepo.findOneOrFail({ where: { id: victimReminder.id } });
    expect(after.userId).toBe(VICTIM);
    expect(after.title).toBe('受害者的提醒');
  });

  it('UT-SEC-02c 自己的数据仍可正常导入（功能未被误伤）', async () => {
    const res = await service.importData(ATTACKER, {
      reminders: [
        {
          id: 'rem-own',
          title: '我自己的提醒',
          category: 'water',
          startDate: '2026-02-01',
          times: ['08:00'],
        },
      ],
    });
    expect(res.imported.reminders).toMatchObject({ imported: 1, skipped: 0 });
    const mine = await reminderRepo.findOneOrFail({ where: { id: 'rem-own' } });
    expect(mine.userId).toBe(ATTACKER);
  });

  it('UT-SEC-02d 导入帖子同样过敏感词过滤（不能借离线绕过审核）', async () => {
    await dataSource.getRepository(SensitiveWord).save(
      dataSource.getRepository(SensitiveWord).create({ id: 'w1', word: '代购处方药', level: 'BLOCK' as never }),
    );
    await service.importData(ATTACKER, {
      posts: [{ id: 'post-blocked', content: '出售代购处方药', type: 'user_plan' }],
    });
    expect(await postRepo.findOne({ where: { id: 'post-blocked' } })).toBeNull();
  });
});
