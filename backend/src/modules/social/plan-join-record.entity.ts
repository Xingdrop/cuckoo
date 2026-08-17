import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { Post } from './post.entity';

/** 一键加入计划记录。UNIQUE(postId, userId) 防重复加入 */
@Entity('plan_join_records')
@Unique(['postId', 'userId'])
@Index(['userId'])
export class PlanJoinRecord {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  postId: string;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'postId' })
  post: Post;

  @Column('text')
  userId: string;

  /** 用户加入后创建的提醒 ID */
  @Column('text')
  reminderId: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  joinedAt: Date;
}
