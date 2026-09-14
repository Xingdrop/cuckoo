/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9hdXRoL2F1dGguY29udHJvbGxlci50c3wyMDI2LTA5fGI4ZjMzNDQ4NjU= */
import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/**
 * 登录/注册限流：默认 5 次/分/IP。
 * E2E_RATE_LIMIT 仅在 NODE_ENV=test 时生效（2026-09-14 安全加固：此前生产若残留该变量
 * 会被静默放大到事实关闭限流），且钳制在 1~10000。
 */
const AUTH_RATE_LIMIT = (() => {
  if (process.env.NODE_ENV !== 'test') return 5;
  const n = Number(process.env.E2E_RATE_LIMIT ?? '5');
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 10_000) : 5;
})();

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: AUTH_RATE_LIMIT, ttl: 60_000 } })
  @ApiOperation({ summary: '注册（FR-101）' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: AUTH_RATE_LIMIT, ttl: 60_000 } })
  @ApiOperation({ summary: '登录（FR-102）' })
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto, ip ?? '');
  }
}
