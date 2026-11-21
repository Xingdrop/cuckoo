/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9tZWRpY2luZXMvbWVkaWNpbmUuZW50aXR5LnRzfDIwMjYtMTF8YzVmYTc3ZTY5MA== */
import {
  AfterLoad,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { MedicinePhoto } from './medicine-photo.entity';
import { utcDateTime } from '../../common/datetime.transformer';

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

  @Column({ type: 'varchar' })
  name: string;

  /** 剂量，如 "10mg" */
  @Column({ type: 'varchar',  nullable: true })
  dosage: string | null;

  /** 服用方式：口服/含服/外用等 */
  @Column({ type: 'varchar',  nullable: true })
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
  @Column({ type: 'varchar',  nullable: true })
  instructions: string | null;

  /** 首图投影（1NF：实际存 medicine_photos 子表） */
  photoUrl?: string | null;

  /** 全部照片投影（#25：多张药品照片） */
  photoUrls?: string[] | null;

  @OneToMany(() => MedicinePhoto, (p) => p.medicine, { eager: true })
  photoRows?: MedicinePhoto[];

  @AfterLoad()
  projectPhotos(): void {
    const rows = this.photoRows ?? [];
    const urls = [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.url);
    this.photoUrl = urls[0] ?? null;
    this.photoUrls = urls.length ? urls : null;
    Object.defineProperty(this, 'photoRows', {
      value: rows,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }

  /** 每次服用扣减数量，默认 1 */
  @Column({ type: 'int', default: 1 })
  deductionPerUse: number;

  /** 启用库存预警通知（默认开） */
  @Column({ type: 'boolean', default: true })
  notifyOnLowStock: boolean;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;

  @UpdateDateColumn({ transformer: utcDateTime })
  updatedAt: Date;

  @DeleteDateColumn({ transformer: utcDateTime })
  deletedAt: Date | null;
}
