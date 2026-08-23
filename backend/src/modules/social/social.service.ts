import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, In, Repository } from 'typeorm';
import { Reminder } from '../reminders/reminder.entity';
import { ReminderLog, ReminderLogStatus } from '../reminders/reminder-log.entity';
import { computeNextTrigger } from '../../common/reminder-schedule';
import { filterSensitiveWords } from '../../common/sensitive-words';
import { AuditService } from '../audit/audit.service';
import { Plan } from '../plans/plan.entity';
import { Follow } from './follow.entity';
import { User } from '../users/user.entity';
import { Interaction, InteractionType } from './interaction.entity';
import { PlanJoinRecord } from './plan-join-record.entity';
import { PlanTemplate, PlanTemplateStatus } from './plan-template.entity';
import { Post, PostStatus, PostType } from './post.entity';
import { SensitiveWord } from './sensitive-word.entity';
import { Group, GroupMember, GroupPost } from './group.entity';

/** 帖子正文长度上限（与前端输入框一致） */
const POST_CONTENT_MAX = 2000;

/**
 * 社交模块（FR-601~609）
 * 帖子/点赞/评论/收藏 + 一键加入计划（事务+幂等）+ 官方计划 + 兴趣小组
 */
@Injectable()
export class SocialService {
  constructor(
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
    @InjectRepository(Interaction)
    private readonly interactionRepo: Repository<Interaction>,
    @InjectRepository(PlanJoinRecord)
    private readonly joinRepo: Repository<PlanJoinRecord>,
    @InjectRepository(PlanTemplate)
    private readonly templateRepo: Repository<PlanTemplate>,
    @InjectRepository(Reminder)
    private readonly reminderRepo: Repository<Reminder>,
    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,
    @InjectRepository(GroupMember)
    private readonly memberRepo: Repository<GroupMember>,
    @InjectRepository(GroupPost)
    private readonly groupPostRepo: Repository<GroupPost>,
    @InjectRepository(SensitiveWord)
    private readonly sensitiveWordRepo: Repository<SensitiveWord>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(ReminderLog)
    private readonly logRepo: Repository<ReminderLog>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** 敏感词缓存（词库小且运营低频更新；进程生命周期内缓存） */
  private sensitiveWordsCache: string[] | null = null;

  /** 加载敏感词并过滤文本（FR-607：命中词替换为 **） */
  private async filterContent(text: string): Promise<string> {
    if (!this.sensitiveWordsCache) {
      const words = await this.sensitiveWordRepo.find();
      this.sensitiveWordsCache = words.map((w) => w.word);
    }
    return filterSensitiveWords(text, this.sensitiveWordsCache);
  }

  // ============ 帖子 ============

  /** 社区帖子流（公开+我的，分页） */
  async listPosts(userId: string, page = 1, pageSize = 20) {
    const [items, total] = await this.postRepo.findAndCount({
      where: { status: PostStatus.PUBLISHED },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: Math.min(pageSize, 100),
      relations: { user: true },
    });
    // 附加当前用户的互动状态
    const postIds = items.map((p) => p.id);
    const myInteractions = postIds.length
      ? await this.interactionRepo.find({ where: { userId, postId: In(postIds) } })
      : [];
    return {
      items: items.map((p) => ({
        ...p,
        author: { id: p.user.id, username: p.user.username, avatarUrl: p.user.avatarUrl },
        myLiked: myInteractions.some((i) => i.postId === p.id && i.type === InteractionType.LIKE),
        myFavorited: myInteractions.some((i) => i.postId === p.id && i.type === InteractionType.FAVORITE),
        myJoined: myInteractions.some((i) => i.postId === p.id && i.type === InteractionType.JOIN),
      })),
      total,
      page,
      pageSize,
    };
  }

  async getPost(userId: string, postId: string) {
    const post = await this.postRepo.findOne({
      where: { id: postId, status: PostStatus.PUBLISHED },
      relations: { user: true },
    });
    if (!post) throw new NotFoundException({ code: 'NOT_FOUND', message: '帖子不存在' });
    const my = await this.interactionRepo.find({ where: { userId, postId } });
    return {
      ...post,
      author: { id: post.user.id, username: post.user.username, avatarUrl: post.user.avatarUrl },
      myLiked: my.some((i) => i.type === InteractionType.LIKE),
      myFavorited: my.some((i) => i.type === InteractionType.FAVORITE),
      myJoined: my.some((i) => i.type === InteractionType.JOIN),
    };
  }

  async createPost(
    userId: string,
    dto: {
      content: string;
      mediaUrls?: string[];
      type?: PostType;
      planSnapshot?: Record<string, unknown> | null;
    },
  ) {
    if (!dto.content?.trim() || dto.content.length > POST_CONTENT_MAX) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `帖子内容 1~${POST_CONTENT_MAX} 字`,
      });
    }
    const content = await this.filterContent(dto.content.trim());
    const post = this.postRepo.create({
      id: randomUUID(),
      userId,
      type: dto.type ?? PostType.USER_PLAN,
      content,
      mediaUrls: dto.mediaUrls ?? [],
      planSnapshot: dto.planSnapshot ?? null,
    });
    return this.postRepo.save(post);
  }

  async removePost(userId: string, postId: string) {
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException({ code: 'NOT_FOUND', message: '帖子不存在' });
    if (post.userId !== userId) {
      throw new BadRequestException({ code: 'FORBIDDEN', message: '只能删除自己的帖子' });
    }
    await this.postRepo.softDelete(postId);
    void this.audit.record('post.delete', userId, { targetType: 'post', targetId: postId });
    return { success: true };
  }

  /** 编辑帖子内容（仅作者；敏感词过滤；updatedAt 自动更新） */
  async updatePost(userId: string, postId: string, content: string) {
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException({ code: 'NOT_FOUND', message: '帖子不存在' });
    if (post.userId !== userId) {
      throw new BadRequestException({ code: 'FORBIDDEN', message: '只能编辑自己的帖子' });
    }
    if (!content?.trim() || content.length > POST_CONTENT_MAX) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `帖子内容 1~${POST_CONTENT_MAX} 字`,
      });
    }
    const filtered = await this.filterContent(content.trim());
    // repo.update 不会触发 @UpdateDateColumn → 手动刷新 updatedAt（前端显示"已编辑"）
    await this.postRepo.update({ id: postId, userId }, { content: filtered, updatedAt: new Date() });
    void this.audit.record('post.update', userId, { targetType: 'post', targetId: postId });
    return this.getPost(userId, postId);
  }

  // ============ 互动（幂等） ============

  /** 点赞/取消（幂等） */
  async toggleLike(userId: string, postId: string) {
    await this.ensurePost(postId);
    const existing = await this.interactionRepo.findOne({
      where: { postId, userId, type: InteractionType.LIKE },
    });
    if (existing) {
      await this.interactionRepo.delete(existing.id);
      await this.postRepo.decrement({ id: postId }, 'likesCount', 1);
      return { liked: false };
    }
    await this.interactionRepo.save(
      this.interactionRepo.create({ id: randomUUID(), postId, userId, type: InteractionType.LIKE }),
    );
    await this.postRepo.increment({ id: postId }, 'likesCount', 1);
    return { liked: true };
  }

  /** 收藏/取消（幂等） */
  async toggleFavorite(userId: string, postId: string) {
    await this.ensurePost(postId);
    const existing = await this.interactionRepo.findOne({
      where: { postId, userId, type: InteractionType.FAVORITE },
    });
    if (existing) {
      await this.interactionRepo.delete(existing.id);
      return { favorited: false };
    }
    await this.interactionRepo.save(
      this.interactionRepo.create({ id: randomUUID(), postId, userId, type: InteractionType.FAVORITE }),
    );
    return { favorited: true };
  }

  async addComment(userId: string, postId: string, content: string) {
    await this.ensurePost(postId);
    if (!content.trim() || content.length > 500) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '评论 1~500 字' });
    }
    const filtered = await this.filterContent(content.trim());
    const comment = await this.interactionRepo.save(
      this.interactionRepo.create({
        id: randomUUID(),
        postId,
        userId,
        type: InteractionType.COMMENT,
        content: filtered,
      }),
    );
    await this.postRepo.increment({ id: postId }, 'commentsCount', 1);
    return comment;
  }

  async listComments(postId: string, page = 1, pageSize = 50) {
    const [items, total] = await this.interactionRepo.findAndCount({
      where: { postId, type: InteractionType.COMMENT },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * pageSize,
      take: Math.min(pageSize, 100),
    });
    // 评论带作者用户名（单次批量查询）
    const userIds = [...new Set(items.map((i) => i.userId))];
    const users = userIds.length
      ? await this.userRepo.find({ where: { id: In(userIds) }, select: { id: true, username: true } })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.username]));
    const comments = items.map((i) => ({
      id: i.id,
      content: i.content,
      createdAt: i.createdAt,
      author: { id: i.userId, username: userMap.get(i.userId) ?? '已注销用户' },
    }));
    return { items: comments, total, page, pageSize };
  }

  // ============ 一键加入计划（事务 + 幂等） ============

  async joinPlan(userId: string, postId: string) {
    return this.dataSource.transaction(async (manager) => {
      const postRepo = manager.getRepository(Post);
      const joinRepo = manager.getRepository(PlanJoinRecord);
      const reminderRepo = manager.getRepository(Reminder);
      const interactionRepo = manager.getRepository(Interaction);
      const planRepo = manager.getRepository(Plan);
      const userRepo = manager.getRepository(User);

      const post = await postRepo.findOne({ where: { id: postId, status: PostStatus.PUBLISHED } });
      if (!post || !post.planSnapshot) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '该帖子不含可加入的计划' });
      }

      // 幂等：已加入直接返回
      const existing = await joinRepo.findOne({ where: { postId, userId } });
      if (existing?.isActive) {
        return { joined: true, duplicate: true, reminderId: existing.reminderId };
      }
      // 曾退出（isActive=false）：复用旧 join 记录（避免 UNIQUE(postId,userId) 冲突而无法再次加入）
      const reuseJoin = existing ?? null;

      // 落库计划（同帖复用；sourceTitle 展示来源用户名）
      const author = await userRepo.findOne({ where: { id: post.userId } });
      const sourceTitle = `来自 @${author?.username ?? '用户'} 的帖子`;
      let plan = await planRepo.findOne({ where: { userId, sourceType: 'share', sourceId: postId } });
      if (!plan) {
        plan = await planRepo.save(
          planRepo.create({
            id: randomUUID(),
            userId,
            name: sourceTitle,
            description: '',
            sourceType: 'share',
            sourceTitle,
            sourceId: postId,
            isActive: true,
          }),
        );
      }

      // 解析快照并创建提醒
      const snapshot = post.planSnapshot as {
        reminders?: { category?: string; title?: string; repeatRule?: unknown; times?: string[]; startTime?: string; content?: Record<string, unknown> }[];
      };
      const reminders = snapshot.reminders ?? [];
      if (reminders.length === 0) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '计划内容为空' });
      }

      const now = new Date();
      let createdReminder: Reminder | null = null;
      for (const r of reminders) {
        const startDate = new Date(now);
        if (r.startTime) {
          const [h, m] = (r.startTime as string).split(':').map(Number);
          startDate.setHours(h, m, 0, 0);
        }
        const reminder = reminderRepo.create({
          id: randomUUID(),
          userId,
          category: (r.category as Reminder['category']) ?? 'custom',
          title: r.title ?? '加入的计划',
          repeatRule: (r.repeatRule as Reminder['repeatRule']) ?? { type: 'daily' },
          startDate,
          times: r.times ?? null,
          content: r.content ?? {},
          method: {},
          delaySettings: {},
          challenge: {},
          medicineId: null,
          planId: plan.id,
          isActive: true,
          nextTriggerAt: computeNextTrigger(
            (r.repeatRule as Reminder['repeatRule']) ?? { type: 'daily' },
            now,
            startDate,
            null,
            'Asia/Shanghai',
            r.times ?? null,
          ),
        });
        createdReminder = await reminderRepo.save(reminder);
      }

      // 加入/复用 join 记录（退出后再次加入：复用旧记录并更新为新提醒）
      if (reuseJoin) {
        await joinRepo.update(
          { id: reuseJoin.id },
          { reminderId: createdReminder!.id, isActive: true },
        );
      } else {
        const join = joinRepo.create({
          id: randomUUID(),
          postId,
          userId,
          reminderId: createdReminder!.id,
          isActive: true,
        });
        await joinRepo.save(join);
      }

      // 计数 +1（原子; 曾退出后 count 已 -1，此时再加回）
      await postRepo.increment({ id: postId }, 'joinedCount', 1);
      // 记录 join 互动（幂等 UNIQUE）
      await interactionRepo
        .createQueryBuilder()
        .insert()
        .into(Interaction)
        .values({ id: randomUUID(), postId, userId, type: InteractionType.JOIN })
        .orIgnore()
        .execute();

      return { joined: true, duplicate: false, reminderId: createdReminder!.id };
    });
  }

  /** 退出计划 */
  async leavePlan(userId: string, postId: string) {
    return this.dataSource.transaction(async (manager) => {
      const joinRepo = manager.getRepository(PlanJoinRecord);
      const reminderRepo = manager.getRepository(Reminder);
      const postRepo = manager.getRepository(Post);
      const planRepo = manager.getRepository(Plan);

      const join = await joinRepo.findOne({ where: { postId, userId, isActive: true } });
      if (!join) return { left: false };

      // 软删该计划下全部关联提醒（join 只记录最后一条 reminderId，故按 planId 批量删除）
      const plan = await planRepo.findOne({ where: { userId, sourceType: 'share', sourceId: postId } });
      if (plan) {
        await reminderRepo.softDelete({ userId, planId: plan.id });
      } else {
        await reminderRepo.softDelete(join.reminderId);
      }
      join.isActive = false;
      await joinRepo.update({ id: join.id }, { isActive: false });
      await postRepo.decrement({ id: postId }, 'joinedCount', 1);
      return { left: true };
    });
  }

  // ============ 官方计划 ============

  async listTemplates() {
    return this.templateRepo.find({
      where: { status: PlanTemplateStatus.PUBLISHED },
      order: { createdAt: 'DESC' },
    });
  }

  /** 官方计划一键加入（reminderConfig 批量建提醒） */
  async joinTemplate(userId: string, templateId: string) {
    const template = await this.templateRepo.findOne({ where: { id: templateId, status: PlanTemplateStatus.PUBLISHED } });
    if (!template) throw new NotFoundException({ code: 'NOT_FOUND', message: '官方计划不存在' });

    const now = new Date();
    // 官方计划落库计划（sourceType=official，同模板复用）
    const sourceTitle = `官方计划：${template.title}`;
    let plan = await this.planRepo.findOne({
      where: { userId, sourceType: 'official', sourceId: template.id },
    });
    if (!plan) {
      plan = await this.planRepo.save(
        this.planRepo.create({
          id: randomUUID(),
          userId,
          name: sourceTitle,
          description: template.description,
          sourceType: 'official',
          sourceTitle,
          sourceId: template.id,
          isActive: true,
        }),
      );
    }

    let created: Reminder | null = null;
    for (const cfg of template.reminderConfig) {
      const r = cfg as {
        category?: string;
        title?: string;
        repeatRule?: unknown;
        times?: string[];
        startTime?: string;
        content?: Record<string, unknown>;
      };
      const startDate = new Date(now);
      if (r.startTime) {
        const [h, m] = r.startTime.split(':').map(Number);
        startDate.setHours(h, m, 0, 0);
      }
      const reminder = this.reminderRepo.create({
        id: randomUUID(),
        userId,
        category: (r.category as Reminder['category']) ?? 'custom',
        title: r.title ?? template.title,
        repeatRule: (r.repeatRule as Reminder['repeatRule']) ?? { type: 'daily' },
        startDate,
        times: r.times ?? null,
        content: r.content ?? {},
        method: {},
        delaySettings: {},
        challenge: {},
        medicineId: null,
        planId: plan.id,
        isActive: true,
        nextTriggerAt: computeNextTrigger(
          (r.repeatRule as Reminder['repeatRule']) ?? { type: 'daily' },
          now,
          startDate,
          null,
          'Asia/Shanghai',
          r.times ?? null,
        ),
      });
      created = await this.reminderRepo.save(reminder);
    }
    return { joined: true, reminderId: created?.id };
  }

  // ============ 兴趣小组（FR-605） ============

  async createGroup(userId: string, dto: { name: string; description: string }) {
    const group = this.groupRepo.create({
      id: randomUUID(),
      name: dto.name,
      description: dto.description,
      ownerId: userId,
      coverUrl: null,
      memberCount: 1,
    });
    const saved = await this.groupRepo.save(group);
    await this.memberRepo.save(
      this.memberRepo.create({ id: randomUUID(), groupId: saved.id, userId, role: 'owner' }),
    );
    return saved;
  }

  async listGroups() {
    return this.groupRepo.find({ order: { memberCount: 'DESC' } });
  }

  // ============ 个人主页 / 关注（2026-08） ============

  /** 关注/取消关注（幂等 toggle） */
  /** 关注列表（followers=粉丝 / following=关注） */
  async followList(targetId: string, type: 'followers' | 'following') {
    const rows =
      type === 'followers'
        ? await this.followRepo.find({ where: { followingId: targetId }, order: { createdAt: 'DESC' }, take: 100 })
        : await this.followRepo.find({ where: { followerId: targetId }, order: { createdAt: 'DESC' }, take: 100 });
    const userIds = rows.map((r) => (type === 'followers' ? r.followerId : r.followingId));
    const users = userIds.length
      ? await this.userRepo.find({
          where: { id: In(userIds) },
          select: { id: true, username: true, avatarUrl: true },
        })
      : [];
    return users;
  }

  async toggleFollow(viewerId: string, targetId: string) {
    if (viewerId === targetId) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '不能关注自己' });
    }
    const target = await this.userRepo.findOne({ where: { id: targetId } });
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: '用户不存在' });
    const existing = await this.followRepo.findOne({ where: { followerId: viewerId, followingId: targetId } });
    if (existing) {
      await this.followRepo.delete(existing.id);
      return { following: false };
    }
    await this.followRepo.save(
      this.followRepo.create({ id: randomUUID(), followerId: viewerId, followingId: targetId }),
    );
    return { following: true };
  }

  /** 个人主页：资料 / 关注·粉丝数 / 是否已关注 / 数据 / 发帖 */
  async profile(viewerId: string, targetId: string) {
    const user = await this.userRepo.findOne({ where: { id: targetId } });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: '用户不存在' });

    const [followersCount, followingCount, isFollowingRow, posts, totalLogs, completedLogs] =
      await Promise.all([
        this.followRepo.count({ where: { followingId: targetId } }),
        this.followRepo.count({ where: { followerId: targetId } }),
        this.followRepo.findOne({ where: { followerId: viewerId, followingId: targetId } }),
        this.postRepo.find({ where: { userId: targetId }, order: { createdAt: 'DESC' }, take: 50 }),
        this.logRepo.count({ where: { userId: targetId } }),
        this.logRepo.count({
          where: {
            userId: targetId,
            status: In([ReminderLogStatus.COMPLETED, ReminderLogStatus.CHALLENGE_COMPLETED]),
          },
        }),
      ]);

    return {
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        healthGoals: user.healthGoals,
        createdAt: user.createdAt,
      },
      followersCount,
      followingCount,
      isFollowing: Boolean(isFollowingRow),
      isSelf: viewerId === targetId,
      stats: { totalLogs, completedLogs },
      posts,
    };
  }

  async joinGroup(userId: string, groupId: string) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException({ code: 'NOT_FOUND', message: '小组不存在' });
    const existing = await this.memberRepo.findOne({ where: { groupId, userId } });
    if (existing) return { joined: true, duplicate: true };
    await this.memberRepo.save(
      this.memberRepo.create({ id: randomUUID(), groupId, userId, role: 'member' }),
    );
    await this.groupRepo.increment({ id: groupId }, 'memberCount', 1);
    return { joined: true };
  }

  async groupPosts(groupId: string, page = 1, pageSize = 20) {
    const [items, total] = await this.groupPostRepo.findAndCount({
      where: { groupId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: Math.min(pageSize, 100),
    });
    const postIds = items.map((g) => g.postId);
    const posts = postIds.length
      ? await this.postRepo.find({ where: { id: In(postIds) }, relations: { user: true } })
      : [];
    return {
      items: posts.map((p) => ({
        ...p,
        author: { id: p.user.id, username: p.user.username, avatarUrl: p.user.avatarUrl },
      })),
      total,
      page,
      pageSize,
    };
  }

  async groupLeaderboard(groupId: string) {
    // 简化：成员按加入时间 + 组内活跃（帖子数）——MVP 用成员列表排序
    const members = await this.memberRepo.find({
      where: { groupId },
      order: { joinedAt: 'ASC' },
      take: 20,
      relations: { group: false },
    });
    return members;
  }

  private async ensurePost(postId: string) {
    const post = await this.postRepo.findOne({ where: { id: postId, status: PostStatus.PUBLISHED } });
    if (!post) throw new NotFoundException({ code: 'NOT_FOUND', message: '帖子不存在' });
    return post;
  }
}
