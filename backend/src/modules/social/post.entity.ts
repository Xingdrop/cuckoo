/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9zb2NpYWwvcG9zdC5lbnRpdHkudHN8MjAyNi0wOXw5MzVjNTEyYTBj */
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { utcDateTime } from '../../common/datetime.transformer';

export enum PostType {
  USER_PLAN = 'user_plan',
  OFFICIAL_PLAN = 'official_plan',
  ACHIEVEMENT = 'achievement',
  REPORT = 'report',
}

export enum PostStatus {
  PUBLISHED = 'published',
  PENDING_REVIEW = 'pending_review',
  BLOCKED = 'blocked',
}

/** 帖子（社区内容）。planSnapshot 为提醒配置 JSON（一键加入计划的数据源） */
@Entity('posts')
@Index(['userId'])
@Index(['status', 'createdAt'])
export class Post {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text' })
  type: PostType;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'simple-json', default: () => "'[]'" })
  mediaUrls: string[];

  /** 可导入的提醒配置快照（JSON），含 schema 版本号 */
  @Column({ type: 'simple-json', nullable: true })
  planSnapshot: Record<string, unknown> | null;

  @Column({ type: 'int', default: 1 })
  planVersion: number;

  @Column({ type: 'int', default: 0 })
  likesCount: number;

  @Column({ type: 'int', default: 0 })
  commentsCount: number;

  @Column({ type: 'int', default: 0 })
  joinedCount: number;

  @Column({ type: 'text', default: PostStatus.PUBLISHED })
  status: PostStatus;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;

  @UpdateDateColumn({ transformer: utcDateTime })
  updatedAt: Date;

  @DeleteDateColumn({ transformer: utcDateTime })
  deletedAt: Date | null;
}
