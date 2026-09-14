/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9yZXBvcnRzL3JlcG9ydHMuY29udHJvbGxlci50c3wyMDI2LTA5fGU4ZWZjNjdmMDk= */
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsInt, Min, Max } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { ReportType } from './report.entity';

class ListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

class GenerateReportDto {
  @IsIn([ReportType.WEEKLY, ReportType.MONTHLY], { message: 'type 须为 weekly 或 monthly' })
  type: ReportType;
}

/** 报告（周报/月报，FR-704/705） */
@ApiTags('报告')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @ApiOperation({ summary: '报告列表' })
  list(@CurrentUser('sub') userId: string, @Query() q: ListQueryDto) {
    return this.reportsService.list(userId, q.page ?? 1, q.pageSize ?? 20);
  }

  @Get(':id')
  @ApiOperation({ summary: '报告详情' })
  detail(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.reportsService.findOne(userId, id);
  }

  @Post('generate')
  @ApiOperation({ summary: '生成当前周期报告（开发/验收手动触发，AC-601/602）' })
  generate(@CurrentUser('sub') userId: string, @Body() dto: GenerateReportDto) {
    return this.reportsService.generate(userId, dto.type);
  }
}
