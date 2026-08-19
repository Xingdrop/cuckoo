import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reminder } from '../reminders/reminder.entity';
import { Group, GroupMember, GroupPost } from './group.entity';
import { Interaction } from './interaction.entity';
import { PlanJoinRecord } from './plan-join-record.entity';
import { PlanTemplate } from './plan-template.entity';
import { Post } from './post.entity';
import { SensitiveWord } from './sensitive-word.entity';
import { SocialController } from './social.controller';
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
      Group,
      GroupMember,
      GroupPost,
    ]),
  ],
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
