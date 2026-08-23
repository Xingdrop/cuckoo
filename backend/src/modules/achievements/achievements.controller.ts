import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AchievementsService } from './achievements.service';

/** 成就墙（FR-708） */
@ApiTags('成就')
@Controller('achievements')
export class AchievementsController {
  constructor(private readonly achievementsService: AchievementsService) {}

  @Get()
  @ApiOperation({ summary: '成就墙：已达成的成就 + 全部规则与进度' })
  wall(@CurrentUser('sub') userId: string) {
    return this.achievementsService.wall(userId);
  }

  @Get('check')
  @ApiOperation({ summary: '手动触发成就检查（开发/验收用，AC-603）' })
  check(@CurrentUser('sub') userId: string) {
    return this.achievementsService.check(userId);
  }
}
