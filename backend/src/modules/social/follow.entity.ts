/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9zb2NpYWwvZm9sbG93LmVudGl0eS50c3wyMDI2LTA5fDkyY2ZjMmE4NTQ= */ */
import { Column, CreateDateColumn, Entity, PrimaryColumn, Unique } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { utcDateTime } from '../../common/datetime.transformer';

/** 关注关系（2026-08：个人主页关注/粉丝） */
@Entity('follows')
@Unique(['followerId', 'followingId'])
export class Follow {
  @PrimaryColumn('text')
  id: string = randomUUID();

  @Column('text')
  followerId: string;

  @Column('text')
  followingId: string;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;
}
