/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9mYW1pbHkvZmFtaWx5Lm1vZHVsZS50c3wyMDI2LTA5fGExMTEzZTBmN2Q= */ */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RemindersModule } from '../reminders/reminders.module';
import { User } from '../users/user.entity';
import { UserSetting } from '../users/user-setting.entity';
import { Medicine } from '../medicines/medicine.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { SensitiveWord } from '../social/sensitive-word.entity';
import { Notification } from '../notifications/notification.entity';
import { FamilyBinding } from './family-binding.entity';
import { FamilyInvite } from './family-invite.entity';
import { ChatMessage } from './chat-message.entity';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';

/** 亲友绑定：邀请码绑定/健康摘要/简易聊天 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FamilyBinding,
      FamilyInvite,
      ChatMessage,
      User,
      UserSetting,
      Medicine,
      ReminderLog,
      SensitiveWord,
      Notification,
    ]),
    RemindersModule,
  ],
  controllers: [FamilyController],
  providers: [FamilyService],
  exports: [FamilyService],
})
export class FamilyModule {}
