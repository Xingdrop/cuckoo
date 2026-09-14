/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9jb250YWN0cy9lbWVyZ2VuY3ktY29udGFjdC5lbnRpdHkudHN8MjAyNi0wOXxlOTM4NzU1ZDJh */ */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { utcDateTime } from '../../common/datetime.transformer';

/** 亲友联系人：接收库存预警/漏服通知 */
@Entity('emergency_contacts')
@Index(['userId'])
export class EmergencyContact {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar' })
  name: string;

  /** 手机号（短信通道预留；P2 验证码绑定前可空，用邀请码/App 用户关联） */
  @Column({ type: 'varchar',  nullable: true })
  phone: string | null;

  /** 若联系人也是布谷用户 */
  @Column('text', { nullable: true })
  appUserId: string | null;

  /** 关系：家人/朋友等 */
  @Column({ type: 'varchar',  nullable: true })
  relation: string | null;

  @Column({ type: 'boolean', default: true })
  receiveLowStock: boolean;

  @Column({ type: 'boolean', default: true })
  receiveMissed: boolean;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;
}
