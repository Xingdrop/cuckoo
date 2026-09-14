/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9mYW1pbHkvZmFtaWx5LWJpbmRpbmcuZW50aXR5LnRzfDIwMjYtMDl8Njc5ZWZhZDEzOQ== */ */
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { utcDateTime } from '../../common/datetime.transformer';

export enum FamilyBindingStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
}

/**
 * 亲友绑定（账户级双向）：
 * - userAId = 邀请码生成者（审批人）；userBId = 凭码申请人
 * - pending 时仅 userA 可 approve/reject；active 后双方互相可见健康摘要并可聊天
 * - 任一方可解绑（聊天记录按隐私决策保留）
 */
@Entity('family_bindings')
@Unique(['userAId', 'userBId'])
export class FamilyBinding {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  userAId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userAId' })
  userA: User;

  @Column('text')
  userBId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userBId' })
  userB: User;

  @Column({ type: 'varchar', default: FamilyBindingStatus.PENDING })
  status: FamilyBindingStatus;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;

  @UpdateDateColumn({ transformer: utcDateTime })
  updatedAt: Date;
}
