/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9mYW1pbHkvZmFtaWx5LmNvbnRyb2xsZXIudHN8MjAyNi0wOXxlYWQwOGIxOWVh */
import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FamilyService } from './family.service';

class BindByCodeDto {
  @IsString()
  @Matches(/^[2-9A-HJKMNP-Z]{6}$/i, { message: '邀请码格式不正确' })
  code: string;
}

class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '消息不能超过 500 字' })
  content?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\/uploads\//, { message: '图片地址无效' })
  photoUrl?: string | null;
}

class MessagesQueryDto {
  @IsOptional()
  @IsISO8601({}, { message: 'after 须为 ISO 时间' })
  after?: string;

  @IsOptional()
  limit?: number;
}

class SummaryQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '日期格式须为 YYYY-MM-DD' })
  date?: string;
}

@ApiTags('亲友')
@Controller('family')
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  // ---- 绑定 ----

  @Get('invite')
  @ApiOperation({ summary: '我的有效邀请码（无则 code=null）' })
  myInvite(@CurrentUser('sub') userId: string) {
    return this.familyService.getMyInvite(userId);
  }

  @Post('invite')
  @ApiOperation({ summary: '生成/刷新邀请码（24h 有效，旧码作废）' })
  createInvite(@CurrentUser('sub') userId: string) {
    return this.familyService.createInvite(userId);
  }

  @Post('bind')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: '凭邀请码申请绑定（对方同意后生效；一次性消费邀请码）' })
  bind(@CurrentUser('sub') userId: string, @Body() dto: BindByCodeDto) {
    return this.familyService.bindByCode(userId, dto.code);
  }

  @Get('bindings')
  @ApiOperation({ summary: '我的绑定列表（含待审批申请与未读数）' })
  bindings(@CurrentUser('sub') userId: string) {
    return this.familyService.listBindings(userId);
  }

  @Post('bindings/:id/approve')
  @ApiOperation({ summary: '同意绑定申请（仅邀请码属主）' })
  approve(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.familyService.respondBinding(userId, id, true);
  }

  @Post('bindings/:id/reject')
  @ApiOperation({ summary: '拒绝绑定申请（仅邀请码属主）' })
  reject(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.familyService.respondBinding(userId, id, false);
  }

  @Delete('bindings/:id')
  @ApiOperation({ summary: '解除绑定（双方均可，即时生效；聊天记录保留）' })
  unbind(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.familyService.unbind(userId, id);
  }

  // ---- 健康摘要 ----

  @Get('bindings/:id/summary')
  @ApiOperation({ summary: '对方某日健康摘要（完成情况/文字照片/药品库存，只读）' })
  summary(@CurrentUser('sub') userId: string, @Param('id') id: string, @Query() q: SummaryQueryDto) {
    return this.familyService.getPartnerSummary(userId, id, q.date);
  }

  // ---- 聊天 ----

  @Get('bindings/:id/messages')
  @ApiOperation({ summary: '消息列表（after=增量游标；拉取即对方消息置已读）' })
  messages(@CurrentUser('sub') userId: string, @Param('id') id: string, @Query() q: MessagesQueryDto) {
    return this.familyService.getMessages(userId, id, q.after, q.limit ?? 100);
  }

  @Post('bindings/:id/messages')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: '发送消息（文本 ≤500 字 + 可选图片；敏感词过滤）' })
  send(@CurrentUser('sub') userId: string, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.familyService.sendMessage(userId, id, dto.content ?? null, dto.photoUrl ?? null);
  }

  @Get('unread')
  @ApiOperation({ summary: '全部亲友会话未读数（角标）' })
  unread(@CurrentUser('sub') userId: string) {
    return this.familyService.unreadCount(userId);
  }
}
