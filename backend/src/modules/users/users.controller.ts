/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy91c2Vycy91c2Vycy5jb250cm9sbGVyLnRzfDIwMjYtMDl8OWRhZWNkOGNhYQ== */
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

class UpdateMeDto {
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  healthGoals?: string[];

  @IsOptional()
  @IsString()
  timezone?: string;
}

class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  notificationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  vibrationEnabled?: boolean;

  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  missedThresholdMinutes?: number;

  @IsOptional()
  @IsBoolean()
  showSkipButton?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxDelayCount?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10000)
  waterGoalMl?: number;

  /** #13：喝水达标是否计入完成率 */
  @IsOptional()
  @IsBoolean()
  waterInRate?: boolean;

  /** #26：喝水（当日达标）作为完成率可选统计项（今日完成率面板逐项勾选） */
  @IsOptional()
  @IsBoolean()
  waterCountInRate?: boolean;
}

@ApiTags('用户')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: '获取当前用户资料（FR-103）' })
  getMe(@CurrentUser('sub') userId: string) {
    return this.usersService.getMe(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: '更新当前用户资料（FR-103）' })
  updateMe(@CurrentUser('sub') userId: string, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(userId, dto);
  }

  @Get('me/settings')
  @ApiOperation({ summary: '获取通知偏好（FR-104）' })
  getSettings(@CurrentUser('sub') userId: string) {
    return this.usersService.getSettings(userId);
  }

  @Put('me/settings')
  @ApiOperation({ summary: '更新通知偏好（FR-104）' })
  updateSettings(@CurrentUser('sub') userId: string, @Body() dto: UpdateSettingsDto) {
    return this.usersService.updateSettings(userId, dto);
  }

  @Get('me/export')
  @ApiOperation({ summary: '导出全量数据（FR-105/AC-105，JSON 下载）' })
  async exportMe(@CurrentUser('sub') userId: string, @Res({ passthrough: true }) res: Response) {
    const data = await this.usersService.exportData(userId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cuckoo-export-${userId.slice(0, 8)}.json"`,
    );
    return data;
  }

  @Post('me/export-link')
  @ApiOperation({ summary: '生成数据导出下载链接（/uploads 直链，24 小时有效）' })
  exportLink(@CurrentUser('sub') userId: string) {
    return this.usersService.createExportLink(userId);
  }

  @Post('me/import')
  @ApiOperation({ summary: '游客数据导入合并（#3：按同类数据 created_at 较新优先）' })
  importData(@CurrentUser('sub') userId: string, @Body() bundle: Record<string, unknown>) {
    return this.usersService.importData(userId, bundle as never);
  }

  @Delete('me')
  @ApiOperation({ summary: '注销账号（FR-105/AC-106：软删除 + 数据清理，审计留存）' })
  deleteMe(@CurrentUser('sub') userId: string) {
    return this.usersService.deleteAccount(userId);
  }
}
