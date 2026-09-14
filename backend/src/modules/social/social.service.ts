/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9zb2NpYWwvc29jaWFsLnNlcnZpY2UudHN8MjAyNi0wOXw2MWE0MTk1MWE3 */
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

/** 帖子正文长度上限（与前端输入框一致） */
const POST_CONTENT_MAX = 2000;

/**
 * 社交模块（FR-601~604/606~608；兴趣小组已于 2026-09-05 移除）
 * 帖子/点赞/评论/收藏 + 一键加入计划（事务+幂等）+ 官方计划
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
      items: items.map((p) => {
        // 剔除 user 关系实体：其中 phone/healthGoals/timezone 属他人隐私，仅保留 author 投影
        const { user: _author, ...rest } = p;
        return {
        ...rest,
        author: { id: _author.id, username: _author.username, avatarUrl: _author.avatarUrl },
        myLiked: myInteractions.some((i) => i.postId === p.id && i.type === InteractionType.LIKE),
        myFavorited: myInteractions.some((i) => i.postId === p.id && i.type === InteractionType.FAVORITE),
        myJoined: myInteractions.some((i) => i.postId === p.id && i.type === InteractionType.JOIN),
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  /** #6：收藏列表（个人主页"我的收藏"，帖子可点进详情） */
  async favorites(userId: string, ownerId: string) {
    const favInteractions = await this.interactionRepo.find({
      where: { userId: ownerId, type: InteractionType.FAVORITE },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const postIds = favInteractions.map((i) => i.postId);
    if (postIds.length === 0) return { items: [], total: 0 };
    const posts = await this.postRepo.find({
      where: { id: In(postIds), status: PostStatus.PUBLISHED },
      relations: { user: true },
    });
    // 按收藏时间排序 + 附加作者与"我"的互动状态
    const order = new Map(favInteractions.map((i, idx) => [i.postId, idx]));
    const my = await this.interactionRepo.find({ where: { userId, postId: In(postIds) } });
    const items = posts
      .map((p) => {
        const { user: _author, ...rest } = p;
        return {
        ...rest,
        author: { id: _author.id, username: _author.username, avatarUrl: _author.avatarUrl },
        myLiked: my.some((i) => i.postId === p.id && i.type === InteractionType.LIKE),
        myFavorited: true,
        myJoined: my.some((i) => i.postId === p.id && i.type === InteractionType.JOIN),
        };
      })
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return { items, total: items.length };
  }

  async getPost(userId: string, postId: string) {
    const post = await this.postRepo.findOne({
      where: { id: postId, status: PostStatus.PUBLISHED },
      relations: { user: true },
    });
    if (!post) throw new NotFoundException({ code: 'NOT_FOUND', message: '帖子不存在' });
    const my = await this.interactionRepo.find({ where: { userId, postId } });
    const { user: author, ...rest } = post;
    return {
      ...rest,
      author: { id: author.id, username: author.username, avatarUrl: author.avatarUrl },
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
    // 服务器防护：单用户帖子数量上限（防灌库）
    const postCount = await this.postRepo.count({ where: { userId, status: PostStatus.PUBLISHED } });
    if (postCount >= 300) {
      throw new BadRequestException({ code: 'LIMIT_REACHED', message: '发帖数量已达上限（300 条）' });
    }
    if (!dto.content?.trim() || dto.content.length > POST_CONTENT_MAX) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `帖子内容 1~${POST_CONTENT_MAX} 字`,
      });
    }
    const content = await this.filterContent(dto.content.trim());
    // #1：不允许发布"空计划"（planSnapshot 但无提醒）——前端按钮置灰 + 后端兜底
    const snapshot = dto.planSnapshot as { reminders?: unknown[] } | null | undefined;
    if (snapshot && Array.isArray(snapshot.reminders) && snapshot.reminders.length === 0) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '计划还没有提醒，不能发帖' });
    }
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
        return { joined: true, duplicate: true, planId: existing.reminderId };
      }
      // 曾退出（isActive=false）：复用旧 join 记录（避免 UNIQUE(postId,userId) 冲突而无法再次加入）
      const reuseJoin = existing ?? null;

      // 落库计划（同帖复用；sourceTitle 展示来源用户名）
      const author = await userRepo.findOne({ where: { id: post.userId } });
      // #3：加入的计划统一使用上传者命名的计划名（不再用"来自 @xx 的帖子"）；来源改为小注
      const snapshotRaw = post.planSnapshot as { from?: { name?: string } } | null;
      const planName = snapshotRaw?.from?.name?.trim() || post.content;
      const sourceTitle = `由 @${author?.username ?? '用户'} 分享`;
      let plan = await planRepo.findOne({ where: { userId, sourceType: 'share', sourceId: postId } });
      if (!plan) {
        plan = await planRepo.save(
          planRepo.create({
            id: randomUUID(),
            userId,
            name: planName,
            description: '',
            sourceType: 'share',
            sourceTitle,
            sourceId: postId,
            // #18：加入只保存计划+配置，不创建提醒（isActive=false，由用户在计划页开启）
            isActive: false,
            config: null,
          }),
        );
      }

      // 解析快照并保存提醒配置（不创建提醒）
      const snapshot = post.planSnapshot as {
        reminders?: { category?: string; title?: string; repeatRule?: unknown; times?: string[]; startTime?: string; content?: Record<string, unknown> }[];
      };
      const reminders = snapshot.reminders ?? [];
      if (reminders.length === 0) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '计划内容为空' });
      }
      const config = reminders.map((r) => ({
        category: (r.category as string) ?? 'custom',
        title: r.title ?? '加入的计划',
        repeatRule: r.repeatRule ?? { type: 'daily' },
        times: Array.isArray(r.times) ? r.times : null,
        // #14：快照/模板只带 startTime 时，用 startTime 作为当日时间点（否则会被误判为"不定时"）
        ...(r.startTime && !Array.isArray(r.times) ? { times: [r.startTime] } : {}),
        content: r.content ?? {},
      }));
      await planRepo.update({ id: plan.id, userId }, { config: config as never });

      // 加入/复用 join 记录（reminderId 字段存计划 id：加入=保存计划）
      if (reuseJoin) {
        await joinRepo.update(
          { id: reuseJoin.id },
          { reminderId: plan.id, isActive: true },
        );
      } else {
        const join = joinRepo.create({
          id: randomUUID(),
          postId,
          userId,
          reminderId: plan.id,
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

      return { joined: true, duplicate: false, planId: plan.id, configCount: config.length };
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

      // 退出 = 从「我的计划」移除：清除该计划全部关联提醒 + 删除计划（配置一并移除）
      const plan = await planRepo.findOne({ where: { userId, sourceType: 'share', sourceId: postId } });
      if (plan) {
        await reminderRepo.softDelete({ userId, planId: plan.id });
        await planRepo.delete({ id: plan.id, userId });
      } else {
        await reminderRepo.softDelete(join.reminderId);
      }
      // 删除 JOIN 互动记录（关键！否则 getPost/listPosts 的 myJoined 仍为 true → 前端无法退出）
      await manager.getRepository(Interaction).delete({ postId, userId, type: InteractionType.JOIN });
      join.isActive = false;
      await joinRepo.update({ id: join.id }, { isActive: false });
      await postRepo.decrement({ id: postId }, 'joinedCount', 1);
      return { left: true };
    });
  }

  // ============ 官方计划 ============

  /** #20：官方计划列表（附带当前用户 joined 状态——已保存到我的计划 = 已加入） */
  async listTemplates(userId: string) {
    const templates = await this.templateRepo.find({
      where: { status: PlanTemplateStatus.PUBLISHED },
      order: { createdAt: 'DESC' },
    });
    return this.withJoinedState(userId, templates);
  }

  /** 官方计划详情（供预览页；附 joined 状态） */
  async getTemplate(userId: string, templateId: string) {
    const template = await this.templateRepo.findOne({ where: { id: templateId, status: PlanTemplateStatus.PUBLISHED } });
    if (!template) throw new NotFoundException({ code: 'NOT_FOUND', message: '官方计划不存在' });
    return (await this.withJoinedState(userId, [template]))[0];
  }

  /** 批量附加 joined（计划已保存 = 已加入） */
  private async withJoinedState(userId: string, templates: PlanTemplate[]) {
    if (!templates.length) return templates;
    const ids = templates.map((t) => t.id);
    const plans = await this.planRepo.find({
      where: { userId, sourceType: 'official', sourceId: In(ids) },
      select: { id: true, sourceId: true },
    });
    const joinedIds = new Set(plans.map((p) => p.sourceId));
    return templates.map((t) => ({ ...t, joined: joinedIds.has(t.id) }));
  }

  /** 退出官方计划：从我的计划移除（连带清除提醒），状态回退未加入 */
  async leaveTemplate(userId: string, templateId: string) {
    const plan = await this.planRepo.findOne({
      where: { userId, sourceType: 'official', sourceId: templateId },
    });
    if (!plan) return { left: false };
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Reminder).softDelete({ userId, planId: plan.id });
      await manager.getRepository(Plan).delete({ id: plan.id, userId });
    });
    return { left: true };
  }

  /** 官方计划一键加入（#18：只保存计划+提醒配置，不创建提醒；由用户在计划页开启） */
  async joinTemplate(userId: string, templateId: string) {
    const template = await this.templateRepo.findOne({ where: { id: templateId, status: PlanTemplateStatus.PUBLISHED } });
    if (!template) throw new NotFoundException({ code: 'NOT_FOUND', message: '官方计划不存在' });

    const sourceTitle = `官方计划：${template.title}`;
    const config = template.reminderConfig.map((c) => {
      const r = c as {
        category?: string;
        title?: string;
        repeatRule?: unknown;
        times?: string[];
        startTime?: string;
        content?: Record<string, unknown>;
      };
      return {
        category: r.category ?? 'custom',
        title: r.title ?? template.title,
        repeatRule: r.repeatRule ?? { type: 'daily' },
        times: Array.isArray(r.times) ? r.times : null,
        // #14：官方计划模板只带 startTime 时回填为当日时间点（避免被判"不定时"）
        ...(r.startTime && !Array.isArray(r.times) ? { times: [r.startTime] } : {}),
        content: r.content ?? {},
      };
    });
    // 落库计划（sourceType=official，同模板复用；isActive=false 等待用户在计划页启用）
    let plan = await this.planRepo.findOne({
      where: { userId, sourceType: 'official', sourceId: template.id },
    });
    if (plan) {
      if (!plan.config) {
        await this.planRepo.update({ id: plan.id, userId }, { config: config as never });
      }
      return { joined: true, duplicate: true, planId: plan.id, configCount: config.length };
    }
    plan = await this.planRepo.save(
      this.planRepo.create({
        id: randomUUID(),
        userId,
        name: template.title,
        description: template.description,
        sourceType: 'official',
        sourceTitle,
        sourceId: template.id,
        isActive: false,
        config: config as never,
      }),
    );
    return { joined: true, duplicate: false, planId: plan.id, configCount: config.length };
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
        // 安全修复（2026-09-14）：健康目标属敏感健康信息，仅本人可见（前端无值即不渲染该区块）
        healthGoals: viewerId === targetId ? user.healthGoals : null,
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

  private async ensurePost(postId: string) {
    const post = await this.postRepo.findOne({ where: { id: postId, status: PostStatus.PUBLISHED } });
    if (!post) throw new NotFoundException({ code: 'NOT_FOUND', message: '帖子不存在' });
    return post;
  }
}
