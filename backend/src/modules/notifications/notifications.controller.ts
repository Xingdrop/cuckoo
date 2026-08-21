import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Repository } from 'typeorm';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Notification } from './notification.entity';

class PageQueryDto {
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

class ReadDto {
  @IsOptional()
  @IsString()
  id?: string;
}

/** 通知中心（FR-801） */
@ApiTags('通知')
@Controller('notifications')
export class NotificationsController {
  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
  ) {}

  @Get()
  @ApiOperation({ summary: '通知列表' })
  async list(@CurrentUser('sub') userId: string, @Query() q: PageQueryDto) {
    const [items, total] = await this.notifRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: ((q.page ?? 1) - 1) * (q.pageSize ?? 20),
      take: Math.min(q.pageSize ?? 20, 100),
    });
    const unread = await this.notifRepo.count({ where: { userId, isRead: false } });
    return { items, total, unread, page: q.page ?? 1, pageSize: q.pageSize ?? 20 };
  }

  @Patch('read')
  @ApiOperation({ summary: '标记已读（全部或单条）' })
  async markRead(@CurrentUser('sub') userId: string, @Body() dto: ReadDto) {
    if (dto.id) {
      await this.notifRepo.update({ id: String(dto.id), userId }, { isRead: true });
    } else {
      await this.notifRepo.update({ userId, isRead: false }, { isRead: true });
    }
    return { success: true };
  }
}
