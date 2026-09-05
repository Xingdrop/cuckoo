/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9zdGF0cy9zdGF0cy5jb250cm9sbGVyLnRzfDIwMjYtMDl8NDljODBmMzYyNA== */
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StatsService } from './stats.service';

class WaterLogDto {
  @IsInt()
  @Min(1)
  @Max(5000)
  amountMl: number;

  /** 记录日期（YYYY-MM-DD，缺省今天；#4 按日期独立） */
  @IsOptional()
  @IsString()
  date?: string;
}

@ApiTags('统计')
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: '今日看板统计（完成率/连续天数/分类/喝水）' })
  dashboard(@CurrentUser('sub') userId: string) {
    return this.statsService.dashboard(userId);
  }

  @Get('heatmap')
  @ApiOperation({ summary: '月热力图（YYYY-MM）' })
  heatmap(
    @CurrentUser('sub') userId: string,
    @Query('month') month: string,
  ) {
    return this.statsService.heatmap(userId, month ?? this.currentMonth());
  }

  @Get('trend')
  @ApiOperation({ summary: '近 N 天趋势' })
  trend(
    @CurrentUser('sub') userId: string,
    @Query('days') days?: number,
  ) {
    return this.statsService.trend(userId, days ?? 7);
  }

  @Get('water')
  @ApiOperation({ summary: '某日喝水统计（#4：date 缺省今天，按用户时区日界独立）' })
  waterInfo(@CurrentUser('sub') userId: string, @Query('date') date?: string) {
    return this.statsService.waterInfo(userId, date);
  }

  @Post('water')
  @ApiOperation({ summary: '手动记录喝水（FR-403；#4 可指定日期）' })
  waterLog(@CurrentUser('sub') userId: string, @Body() dto: WaterLogDto) {
    return this.statsService.water(userId, dto.amountMl, dto.date);
  }

  private currentMonth(): string {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  }
}
