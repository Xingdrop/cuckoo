/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9zb2NpYWwvc29jaWFsLm1vZHVsZS50c3wyMDI2LTA5fDBmMmNmMGYwMjQ= */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Plan } from '../plans/plan.entity';
import { Reminder } from '../reminders/reminder.entity';
import { ReminderLog } from '../reminders/reminder-log.entity';
import { User } from '../users/user.entity';
import { Follow } from './follow.entity';
import { Interaction } from './interaction.entity';
import { PlanJoinRecord } from './plan-join-record.entity';
import { PlanTemplate } from './plan-template.entity';
import { Post } from './post.entity';
import { SensitiveWord } from './sensitive-word.entity';
import { SocialController } from './social.controller';
import { ProfileController } from './profile.controller';
import { SocialService } from './social.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Post,
      Interaction,
      PlanJoinRecord,
      PlanTemplate,
      SensitiveWord,
      Reminder,
      ReminderLog,
      User,
      Plan,
      Follow,
    ]),
    AuditModule,
  ],
  controllers: [SocialController, ProfileController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
