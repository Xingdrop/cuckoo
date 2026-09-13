/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9yZW1pbmRlcnMvcmVtaW5kZXJzLmNvbnRyb2xsZXIudHN8MjAyNi0wOXw1MjVjMTExYmY0 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BadRequestException } from '@nestjs/common';
import { AckReminderDto } from './dto/ack-reminder.dto';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { RemindersService } from './reminders.service';

class ListQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class LogsQueryDto {
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

class DelayDto {
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes: number;
}

@ApiTags('提醒')
@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  @ApiOperation({ summary: '获取用户所有提醒（FR-201）' })
  list(@CurrentUser('sub') userId: string, @Query() query: ListQueryDto) {
    return this.remindersService.list(userId, query);
  }

  @Get('today')
  @ApiOperation({ summary: '今日概览：将触发 + 已执行（含次数）' })
  today(@CurrentUser('sub') userId: string) {
    return this.remindersService.today(userId);
  }

  @Get('calendar')
  @ApiOperation({ summary: '指定日期规划（日期切换视图）' })
  calendar(
    @CurrentUser('sub') userId: string,
    @Query('date') date: string,
  ) {
    return this.remindersService.dayPlan(userId, date);
  }

  @Post()
  @ApiOperation({ summary: '创建提醒（FR-201/202/203）' })
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateReminderDto) {
    return this.remindersService.create(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '提醒详情' })
  findOne(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.remindersService.findOne(userId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新提醒（FR-209）' })
  update(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.remindersService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除提醒（软删除）' })
  remove(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.remindersService.remove(userId, id);
  }

  @Patch(':id/active')
  @ApiOperation({ summary: '启停提醒（FR-209）' })
  setActive(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.remindersService.setActive(userId, id, isActive);
  }

  @Post(':id/ack')
  @ApiOperation({ summary: '执行上报（幂等，FR-204~207）' })
  ack(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: AckReminderDto,
  ) {
    return this.remindersService.ack(userId, id, dto);
  }

  @Post(':id/note')
  @ApiOperation({ summary: '#58：详情弹窗随手记（纯留言，不改完成状态，1~500 字）' })
  note(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: { scheduledTime?: string; note?: string },
  ) {
    if (!dto.scheduledTime) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '缺少 scheduledTime' });
    if (!dto.note) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '缺少 note' });
    return this.remindersService.upsertNote(userId, id, dto.scheduledTime, dto.note);
  }

  @Post(':id/delay')
  @ApiOperation({ summary: '延迟提醒（FR-205/206）' })
  delay(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: DelayDto,
  ) {
    return this.remindersService.delay(userId, id, dto.minutes);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: '执行记录（FR-308 基础）' })
  logs(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Query() query: LogsQueryDto,
  ) {
    return this.remindersService.logs(userId, id, query.page ?? 1, query.pageSize ?? 20);
  }

  @Delete('logs/:logId')
  @ApiOperation({ summary: '撤回一条执行记录（Undo：返还扣减的库存并删除日志）' })
  deleteLog(@CurrentUser('sub') userId: string, @Param('logId') logId: string) {
    return this.remindersService.deleteLog(userId, logId);
  }

  @Post('logs/:logId/photo')
  @ApiOperation({ summary: '#26：替换照片（拍照记录详情页再次拍照）；photoUrl 空串 = 删除照片' })
  replaceLogPhoto(
    @CurrentUser('sub') userId: string,
    @Param('logId') logId: string,
    @Body() dto: { photoUrl?: string },
  ) {
    if (dto.photoUrl === undefined) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '缺少 photoUrl' });
    return this.remindersService.replaceLogPhoto(userId, logId, dto.photoUrl);
  }
}
