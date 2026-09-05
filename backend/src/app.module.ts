// @Sdrop 布谷(Cuckoo) v1 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvYXBwLm1vZHVsZS50c3wyMDI2LTA4
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CuckooThrottlerGuard } from './common/guards/cuckoo-throttler.guard';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { MedicinesModule } from './modules/medicines/medicines.module';
import { StatsModule } from './modules/stats/stats.module';
import { ExercisesModule } from './modules/exercises/exercises.module';
import { FilesModule } from './modules/files/files.module';
import { SocialModule } from './modules/social/social.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AchievementsModule } from './modules/achievements/achievements.module';
import { PlansModule } from './modules/plans/plans.module';
import { FamilyModule } from './modules/family/family.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { AuditModule } from './modules/audit/audit.module';
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
import { Group, GroupMember, GroupPost } from './modules/social/group.entity';
import { Follow } from './modules/social/follow.entity';
import { FamilyBinding } from './modules/family/family-binding.entity';
import { FamilyInvite } from './modules/family/family-invite.entity';
import { ChatMessage } from './modules/family/chat-message.entity';
import { AuditLog } from './modules/audit/audit-log.entity';
import { Report } from './modules/reports/report.entity';
import { Achievement, AchievementRule } from './modules/achievements/achievement.entity';
import { Plan } from './modules/plans/plan.entity';
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
    ScheduleModule.forRoot(),
    // 全局限流（文档 §6.2/§7.3：普通接口 100 次/分/用户；登录/注册在 controller 层 @Throttle 收紧为 5 次/分/IP）
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret') ?? 'please-change-me-in-production',
        signOptions: { expiresIn: (config.get<string>('jwt.expiresIn') ?? '7d') as never },
      }),
    }),
    // 供全局 JwtAuthGuard 做用户存在性校验（注销后 token 立即失效）
    TypeOrmModule.forFeature([User]),
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
          Group,
          GroupMember,
          GroupPost,
          Follow,
          FamilyBinding,
          FamilyInvite,
          ChatMessage,
          AuditLog,
          Report,
          Achievement,
          AchievementRule,
          Plan,
        ],
        // M0-M1 阶段用 synchronize 快速建表；生产切换 PostgreSQL 后改用 migration
        synchronize: config.get<string>('env') !== 'production',
        // DB_WAL=true 时启用 SQLite WAL 模式（配置此前为死代码，2026-08 修复接入）
        ...(config.get<boolean>('db.wal')
          ? { prepareDatabase: (db: { pragma: (s: string) => unknown }) => void db.pragma('journal_mode = WAL') }
          : {}),
      }),
    }),
    HealthModule,
    SeedModule,
    AuthModule,
    UsersModule,
    RemindersModule,
    MedicinesModule,
    StatsModule,
    ExercisesModule,
    FilesModule,
    SocialModule,
    NotificationsModule,
    ReportsModule,
    PlansModule,
    FamilyModule,
    ContactsModule,
    AuditModule,
    AchievementsModule,
  ],
  providers: [
    // 全局 JWT 鉴权：所有接口默认需要登录，@Public() 例外
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 全局限流（必须在 JwtAuthGuard 之后注册，以便按 userId 限流）
    { provide: APP_GUARD, useClass: CuckooThrottlerGuard },
  ],
})
export class AppModule {}
