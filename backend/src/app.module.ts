import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RemindersModule } from './modules/reminders/reminders.module';
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
import { Exercise } from './modules/exercises/exercise.entity';
import { SensitiveWord } from './modules/social/sensitive-word.entity';
import { SeedModule } from './seed/seed.module';

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
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret') ?? 'please-change-me-in-production',
        signOptions: { expiresIn: (config.get<string>('jwt.expiresIn') ?? '7d') as never },
      }),
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
          Exercise,
          SensitiveWord,
        ],
        // M0-M1 阶段用 synchronize 快速建表；生产切换 PostgreSQL 后改用 migration
        synchronize: config.get<string>('env') !== 'production',
      }),
    }),
    HealthModule,
    SeedModule,
    AuthModule,
    UsersModule,
    RemindersModule,
  ],
  providers: [
    // 全局 JWT 鉴权：所有接口默认需要登录，@Public() 例外
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
