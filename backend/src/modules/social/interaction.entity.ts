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

export enum InteractionType {
  LIKE = 'like',
  COMMENT = 'comment',
  FAVORITE = 'favorite',
  JOIN = 'join',
}

/** 互动记录。UNIQUE(postId, userId, type) 保证点赞/收藏/加入幂等 */
@Entity('interactions')
@Unique(['postId', 'userId', 'type'])
@Index(['userId'])
export class Interaction {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  postId: string;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'postId' })
  post: Post;

  @Column('text')
  userId: string;

  @Column({ type: 'text' })
  type: InteractionType;

  /** 评论内容（type=comment 时） */
  @Column({ type: 'varchar',  nullable: true })
  content: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
