/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9mYW1pbHkvZmFtaWx5LWludml0ZS5lbnRpdHkudHN8MjAyNi0wOXw0MGM2MzE0ODgz */
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { utcDateTime } from '../../common/datetime.transformer';

/** 亲友绑定邀请码：一人同时仅一个有效码，24h 过期，绑定成功即消费 */
@Entity('family_invites')
export class FamilyInvite {
  @PrimaryColumn('text')
  id: string;

  /** 邀请码属主（生成者，绑定后为审批人 userAId） */
  @Column('text')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', unique: true })
  code: string;

  @Column({ type: 'datetime', transformer: utcDateTime })
  expiresAt: Date;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;
}
