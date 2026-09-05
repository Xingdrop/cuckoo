/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9jb250YWN0cy9jb250YWN0cy5jb250cm9sbGVyLnRzfDIwMjYtMDl8N2VmMTY3YjVlNQ== */
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ContactsService } from './contacts.service';

class ContactDto {
  @IsString()
  @MinLength(1, { message: '姓名不能为空' })
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  relation?: string | null;

  /** 关联布谷账户（从已绑定亲友中选择；用于站内漏服/库存通知） */
  @IsOptional()
  @IsString()
  @IsUUID()
  appUserId?: string | null;

  @IsOptional()
  @IsBoolean()
  receiveLowStock?: boolean;

  @IsOptional()
  @IsBoolean()
  receiveMissed?: boolean;
}

@ApiTags('亲友联系人')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @ApiOperation({ summary: '联系人列表（FR-306）' })
  list(@CurrentUser('sub') userId: string) {
    return this.contactsService.list(userId);
  }

  @Post()
  @ApiOperation({ summary: '添加联系人' })
  create(@CurrentUser('sub') userId: string, @Body() dto: ContactDto) {
    return this.contactsService.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑联系人（含通知开关）' })
  update(@CurrentUser('sub') userId: string, @Param('id') id: string, @Body() dto: ContactDto) {
    return this.contactsService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除联系人' })
  remove(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.contactsService.remove(userId, id);
  }
}
