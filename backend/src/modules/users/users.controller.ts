import {
  Body,
  Controller,
  Get,
  Patch,
  Put,
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
}
