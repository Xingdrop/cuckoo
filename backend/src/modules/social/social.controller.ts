import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PostType } from './post.entity';
import { SocialService } from './social.service';

class CreatePostDto {
  @IsString()
  @MaxLength(2000)
  content: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @IsOptional()
  @IsString()
  type?: PostType;

  @IsOptional()
  planSnapshot?: Record<string, unknown> | null;
}

class CommentDto {
  @IsString()
  @MaxLength(500)
  content: string;
}

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

class CreateGroupDto {
  @IsString()
  @MaxLength(30)
  name: string;

  @IsString()
  @MaxLength(300)
  description: string;
}

@ApiTags('社交')
@Controller()
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  // ---- 帖子 ----
  @Get('posts')
  @ApiOperation({ summary: '社区帖子流（FR-601）' })
  listPosts(@CurrentUser('sub') userId: string, @Query() q: PageQueryDto) {
    return this.socialService.listPosts(userId, q.page ?? 1, q.pageSize ?? 20);
  }

  @Post('posts')
  @ApiOperation({ summary: '发布帖子' })
  createPost(@CurrentUser('sub') userId: string, @Body() dto: CreatePostDto) {
    return this.socialService.createPost(userId, dto);
  }

  @Get('posts/:id')
  @ApiOperation({ summary: '帖子详情' })
  getPost(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.socialService.getPost(userId, id);
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: '删除帖子' })
  removePost(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.socialService.removePost(userId, id);
  }

  // ---- 互动 ----
  @Post('posts/:id/like')
  @ApiOperation({ summary: '点赞/取消（FR-604）' })
  like(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.socialService.toggleLike(userId, id);
  }

  @Post('posts/:id/favorite')
  @ApiOperation({ summary: '收藏/取消' })
  favorite(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.socialService.toggleFavorite(userId, id);
  }

  @Post('posts/:id/comment')
  @ApiOperation({ summary: '评论' })
  comment(@CurrentUser('sub') userId: string, @Param('id') id: string, @Body() dto: CommentDto) {
    return this.socialService.addComment(userId, id, dto.content);
  }

  @Get('posts/:id/comments')
  @ApiOperation({ summary: '评论列表' })
  comments(@Param('id') id: string, @Query() q: PageQueryDto) {
    return this.socialService.listComments(id, q.page ?? 1, q.pageSize ?? 50);
  }

  // ---- 一键加入 ----
  @Post('posts/:id/join')
  @ApiOperation({ summary: '一键加入计划（FR-602）' })
  join(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.socialService.joinPlan(userId, id);
  }

  @Delete('posts/:id/join')
  @ApiOperation({ summary: '退出计划' })
  leave(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.socialService.leavePlan(userId, id);
  }

  // ---- 官方计划 ----
  @Get('plan-templates')
  @ApiOperation({ summary: '官方计划列表（FR-606）' })
  templates() {
    return this.socialService.listTemplates();
  }

  @Post('plan-templates/:id/join')
  @ApiOperation({ summary: '加入官方计划' })
  joinTemplate(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.socialService.joinTemplate(userId, id);
  }

  // ---- 兴趣小组 ----
  @Get('groups')
  @ApiOperation({ summary: '小组列表（FR-605）' })
  groups() {
    return this.socialService.listGroups();
  }

  @Post('groups')
  @ApiOperation({ summary: '创建小组' })
  createGroup(@CurrentUser('sub') userId: string, @Body() dto: CreateGroupDto) {
    return this.socialService.createGroup(userId, dto);
  }

  @Post('groups/:id/join')
  @ApiOperation({ summary: '加入小组' })
  joinGroup(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.socialService.joinGroup(userId, id);
  }

  @Get('groups/:id/posts')
  @ApiOperation({ summary: '组内帖子' })
  groupPosts(@Param('id') id: string, @Query() q: PageQueryDto) {
    return this.socialService.groupPosts(id, q.page ?? 1, q.pageSize ?? 20);
  }
}
