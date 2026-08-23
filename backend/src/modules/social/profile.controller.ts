import { BadRequestException, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SocialService } from './social.service';

/** 个人主页与关注（2026-08） */
@ApiTags('个人主页')
@Controller()
export class ProfileController {
  constructor(private readonly socialService: SocialService) {}

  @Get('users/:id/profile')
  @ApiOperation({ summary: '个人主页：资料/关注粉丝数/数据/发帖' })
  profile(@CurrentUser('sub') viewerId: string, @Param('id') id: string) {
    return this.socialService.profile(viewerId, id);
  }

  @Post('users/:id/follow')
  @ApiOperation({ summary: '关注/取消关注（幂等 toggle）' })
  follow(@CurrentUser('sub') viewerId: string, @Param('id') id: string) {
    return this.socialService.toggleFollow(viewerId, id);
  }
}
