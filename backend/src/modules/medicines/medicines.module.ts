import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Notification } from '../notifications/notification.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { Medicine } from './medicine.entity';
import { MedicinesController } from './medicines.controller';
import { MedicinesService } from './medicines.service';

@Module({
  imports: [TypeOrmModule.forFeature([Medicine, ReminderLog, Notification]), AuditModule],
  controllers: [MedicinesController],
  providers: [MedicinesService],
  exports: [MedicinesService],
})
export class MedicinesModule {}
