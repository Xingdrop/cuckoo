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
