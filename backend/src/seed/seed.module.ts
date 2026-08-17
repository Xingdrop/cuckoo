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
