/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9wbGFucy9wbGFucy5jb250cm9sbGVyLnRzfDIwMjYtMDl8ZTJmMmJkZTBjOQ== */ */
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlansService } from './plans.service';
import { SocialService } from '../social/social.service';
import { PostType } from '../social/post.entity';

class CreatePlanDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** 我的计划（2026-08：自建计划 / 一键加入落库 / 启停 / 一键发帖） */
@ApiTags('计划')
@Controller('plans')
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly socialService: SocialService,
  ) {}

  @Get()
  @ApiOperation({ summary: '我的计划列表（含提醒数）' })
  list(@CurrentUser('sub') userId: string) {
    return this.plansService.list(userId);
  }

  @Post()
  @ApiOperation({ summary: '新建自建计划' })
  create(@CurrentUser('sub') userId: string, @Body() dto: CreatePlanDto) {
    return this.plansService.create(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '计划详情（含提醒列表）' })
  detail(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.plansService.findOne(userId, id);
  }

  @Get(':id/snapshot')
  @ApiOperation({ summary: '计划快照（供发布帖子引用：planSnapshot 结构）' })
  snapshot(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.plansService.buildSnapshot(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新计划（名称/描述/启停）' })
  update(@CurrentUser('sub') userId: string, @Param('id') id: string, @Body() dto: UpdatePlanDto) {
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.description !== undefined) patch.description = dto.description.trim();
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    return this.plansService.patch(userId, id, patch);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除计划（关联提醒保留但解除归属）' })
  remove(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.plansService.remove(userId, id);
  }

  @Post(':id/share')
  @ApiOperation({ summary: '一键发帖：把计划导出为社区计划帖' })
  share(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.plansService.buildSnapshot(userId, id).then((snapshot) =>
      this.socialService.createPost(userId, {
        content: `📋 我的计划「${snapshot.from.name}」：${snapshot.reminders.length} 条提醒，欢迎一键加入一起坚持！`,
        type: PostType.USER_PLAN,
        planSnapshot: snapshot,
      }),
    );
  }
}
