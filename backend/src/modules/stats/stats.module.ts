import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RemindersModule } from '../reminders/reminders.module';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { UserSetting } from '../users/user-setting.entity';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [
    RemindersModule,
    TypeOrmModule.forFeature([ReminderLog, UserSetting]),
  ],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
