/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9jb250YWN0cy9jb250YWN0cy5tb2R1bGUudHN8MjAyNi0wOXxkZDU3ODNlYTA2 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { EmergencyContact } from './emergency-contact.entity';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

/** 亲友联系人：漏服/库存预警通知数据源（CRUD 2026-09 补齐） */
@Module({
  imports: [TypeOrmModule.forFeature([EmergencyContact, User])],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
