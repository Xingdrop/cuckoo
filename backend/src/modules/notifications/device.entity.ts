/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9ub3RpZmljYXRpb25zL2RldmljZS5lbnRpdHkudHN8MjAyNi0wOXxmNGIxOWFhYWMy */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { utcDateTime } from '../../common/datetime.transformer';

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

  @Column({ type: 'datetime', transformer: utcDateTime, nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;

  @UpdateDateColumn({ transformer: utcDateTime })
  updatedAt: Date;
}
