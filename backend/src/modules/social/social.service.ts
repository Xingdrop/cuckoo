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
import { computeNextTrigger } from '../../common/reminder-schedule';
import { filterSensitiveWords } from '../../common/sensitive-words';
import { AuditService } from '../audit/audit.service';
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
    return { items, total, page, pageSize };
  }

  // ============ 一键加入计划（事务 + 幂等） ============

  async joinPlan(userId: string, postId: string) {
    return this.dataSource.transaction(async (manager) => {
      const postRepo = manager.getRepository(Post);
      const joinRepo = manager.getRepository(PlanJoinRecord);
      const reminderRepo = manager.getRepository(Reminder);
      const interactionRepo = manager.getRepository(Interaction);

      const post = await postRepo.findOne({ where: { id: postId, status: PostStatus.PUBLISHED } });
      if (!post || !post.planSnapshot) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '该帖子不含可加入的计划' });
      }

      // 幂等：已加入直接返回
      const existing = await joinRepo.findOne({ where: { postId, userId } });
      if (existing?.isActive) {
        return { joined: true, duplicate: true, reminderId: existing.reminderId };
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

      const join = joinRepo.create({
        id: randomUUID(),
        postId,
        userId,
        reminderId: createdReminder!.id,
        isActive: true,
      });
      await joinRepo.save(join);

      // 计数 +1（原子）
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

      const join = await joinRepo.findOne({ where: { postId, userId, isActive: true } });
      if (!join) return { left: false };

      join.isActive = false;
      await joinRepo.save(join);
      await reminderRepo.softDelete(join.reminderId);
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
