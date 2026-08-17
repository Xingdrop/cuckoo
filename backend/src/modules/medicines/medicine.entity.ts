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

/** 药品。库存扣减在 Service 层事务中执行 */
@Entity('medicines')
@Index(['userId'])
export class Medicine {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  userId: string;

  @ManyToOne(() => User, (u) => u.medicines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  name: string;

  /** 剂量，如 "10mg" */
  @Column({ nullable: true })
  dosage: string | null;

  /** 服用方式：口服/含服/外用等 */
  @Column({ nullable: true })
  administration: string | null;

  /** 剩余库存（片/粒/包） */
  @Column({ type: 'int', default: 0 })
  stock: number;

  /** 库存预警阈值 */
  @Column({ type: 'int', default: 0 })
  threshold: number;

  @Column({ type: 'date', nullable: true })
  expiryDate: string | null;

  /** 服用说明：饭前/饭后/空腹等 */
  @Column({ nullable: true })
  instructions: string | null;

  @Column({ nullable: true })
  photoUrl: string | null;

  /** 每次服用扣减数量，默认 1 */
  @Column({ type: 'int', default: 1 })
  deductionPerUse: number;

  /** 启用库存预警通知（默认开） */
  @Column({ default: true })
  notifyOnLowStock: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
