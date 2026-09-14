/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9mYW1pbHkvY2hhdC1tZXNzYWdlLmVudGl0eS50c3wyMDI2LTA5fDkyYTVhMDdjOGI= */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { utcDateTime } from '../../common/datetime.transformer';

/** 亲友聊天消息（简易图文；解绑后记录保留在各自库中，但绑定已删不可再访问） */
@Entity('family_chat_messages')
@Index(['bindingId', 'createdAt'])
export class ChatMessage {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  bindingId: string;

  @Column('text')
  senderId: string;

  /** 文本内容（与 photoUrl 至少一项；≤500 字） */
  @Column({ type: 'varchar', nullable: true })
  content: string | null;

  /** 可选配图（/files/upload 返回的相对路径） */
  @Column({ type: 'varchar', nullable: true })
  photoUrl: string | null;

  /** 对方读取时间（拉取时置位，用于未读角标） */
  @Column({ type: 'datetime', transformer: utcDateTime, nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ transformer: utcDateTime })
  createdAt: Date;
}
