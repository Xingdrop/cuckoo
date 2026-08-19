import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exercise } from './exercise.entity';
import { ExercisesController } from './exercises.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Exercise])],
  controllers: [ExercisesController],
})
export class ExercisesModule {}
