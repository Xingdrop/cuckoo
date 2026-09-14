/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9tZWRpY2luZXMvbWVkaWNpbmVzLm1vZHVsZS50c3wyMDI2LTA5fDIzNWVmYmRiZjk= */ */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Notification } from '../notifications/notification.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { Medicine } from './medicine.entity';
import { MedicinesController } from './medicines.controller';
import { MedicinesService } from './medicines.service';

@Module({
  imports: [TypeOrmModule.forFeature([Medicine, ReminderLog, Notification]), AuditModule, NotificationsModule],
  controllers: [MedicinesController],
  providers: [MedicinesService],
  exports: [MedicinesService],
})
export class MedicinesModule {}
