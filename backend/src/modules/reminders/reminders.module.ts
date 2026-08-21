import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Medicine } from '../medicines/medicine.entity';
import { User } from '../users/user.entity';
import { UserSetting } from '../users/user-setting.entity';
import { ReminderLog } from './reminder-log.entity';
import { Reminder } from './reminder.entity';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  imports: [TypeOrmModule.forFeature([Reminder, ReminderLog, User, UserSetting, Medicine]), AuditModule],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
