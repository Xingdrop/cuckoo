/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9ub3RpZmljYXRpb25zL25vdGlmaWNhdGlvbnMubW9kdWxlLnRzfDIwMjYtMDl8MzhiN2Y3ZWJjOQ== */ */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmergencyContact } from '../contacts/emergency-contact.entity';
import { Reminder } from '../reminders/reminder.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { UserSetting } from '../users/user-setting.entity';
import { Device } from './device.entity';
import { DevicesController } from './devices.controller';
import { NotificationsController } from './notifications.controller';
import { MissedScanner } from './missed-scanner';
import { ReminderPushScanner } from './reminder-push-scanner';
import { PushService } from './push.service';
import { NotificationLog } from './notification-log.entity';
import { Notification } from './notification.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Device,
      Notification,
      NotificationLog,
      Reminder,
      ReminderLog,
      EmergencyContact,
      UserSetting,
    ]),
  ],
  controllers: [DevicesController, NotificationsController],
  providers: [PushService, MissedScanner, ReminderPushScanner],
  exports: [PushService],
})
export class NotificationsModule {}
