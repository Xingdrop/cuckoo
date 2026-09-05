/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9zdGF0cy9zdGF0cy5tb2R1bGUudHN8MjAyNi0wOXxiOTBiODI2YWE3 */
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
