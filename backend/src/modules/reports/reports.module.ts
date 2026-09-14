/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9yZXBvcnRzL3JlcG9ydHMubW9kdWxlLnRzfDIwMjYtMDl8Nzc5NDNhZTU2Mg== */ */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Notification } from '../notifications/notification.entity';
import { RemindersModule } from '../reminders/reminders.module';
import { StatsModule } from '../stats/stats.module';
import { User } from '../users/user.entity';
import { Report } from './report.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    StatsModule,
    RemindersModule,
    NotificationsModule,
    AuditModule,
    TypeOrmModule.forFeature([Report, Notification, User]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
