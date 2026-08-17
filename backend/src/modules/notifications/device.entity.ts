import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Web Push 订阅端点（用户多设备） */
@Entity('devices')
@Index(['userId'])
export class Device {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  userId: string;

  /** Push 订阅端点（唯一） */
  @Column({ type: 'varchar',  unique: true })
  endpoint: string;

  @Column({ type: 'varchar' })
  keysAuth: string;

  @Column({ type: 'varchar' })
  keysP256dh: string;

  @Column({ type: 'varchar',  nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar',  nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
