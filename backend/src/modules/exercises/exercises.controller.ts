/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9leGVyY2lzZXMvZXhlcmNpc2VzLmNvbnRyb2xsZXIudHN8MjAyNi0wOXxhNTljZDM1NzZi */ */
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Exercise } from './exercise.entity';

@ApiTags('微运动')
@Controller('exercises')
export class ExercisesController {
  constructor(
    @InjectRepository(Exercise)
    private readonly exerciseRepo: Repository<Exercise>,
  ) {}

  @Get()
  @ApiOperation({ summary: '微运动库列表（FR-405）' })
  list() {
    return this.exerciseRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }
}
