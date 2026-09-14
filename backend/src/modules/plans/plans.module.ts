/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9wbGFucy9wbGFucy5tb2R1bGUudHN8MjAyNi0wOXw5ZmNkZDRhN2Uz */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reminder } from '../reminders/reminder.entity';
import { SocialModule } from '../social/social.module';
import { Plan } from './plan.entity';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  imports: [TypeOrmModule.forFeature([Plan, Reminder]), SocialModule],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
