import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { HealthModule } from './modules/health/health.module';
import { User } from './modules/users/user.entity';
import { UserSetting } from './modules/users/user-setting.entity';
import { Reminder } from './modules/reminders/reminder.entity';
import { ReminderLog } from './modules/reminders/reminder-log.entity';
import { Medicine } from './modules/medicines/medicine.entity';
import { EmergencyContact } from './modules/contacts/emergency-contact.entity';
import { Post } from './modules/social/post.entity';
import { Interaction } from './modules/social/interaction.entity';
import { PlanJoinRecord } from './modules/social/plan-join-record.entity';
import { PlanTemplate } from './modules/social/plan-template.entity';
import { Notification } from './modules/notifications/notification.entity';
import { NotificationLog } from './modules/notifications/notification-log.entity';
import { Device } from './modules/notifications/device.entity';

/**
 * 根模块：全局配置 + 数据库 + 领域模块装配。
 * 新增领域模块时在此注册，并同步 docs/技术方案设计.md §4 目录说明。
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'better-sqlite3',
        database: config.get<string>('db.path'),
        entities: [
          User,
          UserSetting,
          Reminder,
          ReminderLog,
          Medicine,
          EmergencyContact,
          Post,
          Interaction,
          PlanJoinRecord,
          PlanTemplate,
          Notification,
          NotificationLog,
          Device,
        ],
        // M0-M1 阶段用 synchronize 快速建表；生产切换 PostgreSQL 后改用 migration
        synchronize: config.get<string>('env') !== 'production',
      }),
    }),
    HealthModule,
  ],
})
export class AppModule {}
