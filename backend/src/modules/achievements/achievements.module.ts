/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9hY2hpZXZlbWVudHMvYWNoaWV2ZW1lbnRzLm1vZHVsZS50c3wyMDI2LTA5fDk4NmMyMjM1YWE= */
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { Notification } from '../notifications/notification.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { RemindersModule } from '../reminders/reminders.module';
import { Achievement, AchievementRule } from './achievement.entity';
import { AchievementsController } from './achievements.controller';
import { AchievementsService } from './achievements.service';

@Module({
  imports: [
    // 注意：只能依赖 RemindersModule（forwardRef 双向）——不可依赖 StatsModule，否则形成
    // Reminders → Achievements → Stats → Reminders 循环依赖（Nest 启动报 UndefinedModuleException）
    forwardRef(() => RemindersModule),
    NotificationsModule,
    TypeOrmModule.forFeature([Achievement, AchievementRule, ReminderLog, Notification]),
  ],
  controllers: [AchievementsController],
  providers: [AchievementsService],
  exports: [AchievementsService],
})
export class AchievementsModule {}
