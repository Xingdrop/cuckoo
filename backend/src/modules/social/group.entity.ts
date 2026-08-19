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
import { User } from '../users/user.entity';

/** 兴趣小组（FR-605） */
@Entity('groups')
export class Group {
  @PrimaryColumn('text')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', nullable: true })
  coverUrl: string | null;

  @Column('text')
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column({ type: 'int', default: 0 })
  memberCount: number;

  @CreateDateColumn({ transformer: { to: (v) => v, from: (v) => v } })
  createdAt: Date;
}

/** 小组成员 */
@Entity('group_members')
@Unique(['groupId', 'userId'])
@Index(['userId'])
export class GroupMember {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  groupId: string;

  @ManyToOne(() => Group, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group: Group;

  @Column('text')
  userId: string;

  @Column({ type: 'varchar', default: 'member' })
  role: string;

  @CreateDateColumn({ transformer: { to: (v) => v, from: (v) => v } })
  joinedAt: Date;
}

/** 组内帖子（复用 posts 表） */
@Entity('group_posts')
@Unique(['groupId', 'postId'])
export class GroupPost {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  groupId: string;

  @ManyToOne(() => Group, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group: Group;

  @Column('text')
  postId: string;

  @CreateDateColumn({ transformer: { to: (v) => v, from: (v) => v } })
  createdAt: Date;
}
