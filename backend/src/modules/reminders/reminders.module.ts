import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Medicine } from '../medicines/medicine.entity';
import { User } from '../users/user.entity';
import { ReminderLog } from './reminder-log.entity';
import { Reminder } from './reminder.entity';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  imports: [TypeOrmModule.forFeature([Reminder, ReminderLog, User, Medicine])],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
