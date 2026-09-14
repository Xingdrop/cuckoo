/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9yZW1pbmRlcnMvcmVtaW5kZXJzLm1vZHVsZS50c3wyMDI2LTA5fDc4NzUwOTRkOWM= */ */
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AchievementsModule } from '../achievements/achievements.module';
import { AuditModule } from '../audit/audit.module';
import { Medicine } from '../medicines/medicine.entity';
import { PlansModule } from '../plans/plans.module';
import { User } from '../users/user.entity';
import { UserSetting } from '../users/user-setting.entity';
import { ReminderLog } from './reminder-log.entity';
import { Reminder } from './reminder.entity';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reminder, ReminderLog, User, UserSetting, Medicine]),
    AuditModule,
    PlansModule,
    forwardRef(() => AchievementsModule),
  ],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
