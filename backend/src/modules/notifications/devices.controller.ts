/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9ub3RpZmljYXRpb25zL2RldmljZXMuY29udHJvbGxlci50c3wyMDI2LTA5fGQ2ODhjODI3MjI= */
import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PushService } from './push.service';

class RegisterDeviceDto {
  @IsString()
  endpoint: string;

  @IsString()
  keysAuth: string;

  @IsString()
  keysP256dh: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  userAgent?: string;
}

@ApiTags('推送')
@Controller()
export class DevicesController {
  constructor(
    private readonly pushService: PushService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('push/vapid-key')
  @ApiOperation({ summary: 'VAPID 公钥（前端订阅 Push 用）' })
  vapidKey() {
    return { publicKey: this.config.get<string>('push.vapidPublicKey') ?? '' };
  }

  @Get('devices')
  @ApiOperation({ summary: '我的推送设备列表（FR-802）' })
  list(@CurrentUser('sub') userId: string) {
    return this.pushService.listDevices(userId);
  }

  @Post()
  @ApiOperation({ summary: '注册 Web Push 订阅（FR-802）' })
  register(@CurrentUser('sub') userId: string, @Body() dto: RegisterDeviceDto) {
    return this.pushService.upsertDevice(userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除订阅（退订）' })
  remove(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.pushService.removeDevice(userId, id);
  }
}
