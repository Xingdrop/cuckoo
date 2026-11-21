/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9tZWRpY2luZXMvbWVkaWNpbmUtcGhvdG8uZW50aXR5LnRzfDIwMjYtMTF8ZGVlOTdiOWYwOA== */
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Medicine } from './medicine.entity';

/** 药品照片（1NF：photoUrls 数组拆子表；sortOrder 决定首图） */
@Entity('medicine_photos')
export class MedicinePhoto {
  @PrimaryColumn('text')
  medicineId: string;

  @PrimaryColumn({ type: 'integer' })
  sortOrder: number;

  @Column({ type: 'varchar' })
  url: string;

  @ManyToOne(() => Medicine, (m) => m.photoRows, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'medicineId' })
  medicine: Medicine;
}
