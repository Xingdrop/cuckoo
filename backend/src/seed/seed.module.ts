/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvc2VlZC9zZWVkLm1vZHVsZS50c3wyMDI2LTA5fDQ4NmRlZmZiYzM= */ */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exercise } from '../modules/exercises/exercise.entity';
import { PlanTemplate } from '../modules/social/plan-template.entity';
import { SensitiveWord } from '../modules/social/sensitive-word.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlanTemplate, Exercise, SensitiveWord])],
  providers: [SeedService],
})
export class SeedModule {}
