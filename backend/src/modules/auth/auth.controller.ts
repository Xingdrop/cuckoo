/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9hdXRoL2F1dGguY29udHJvbGxlci50c3wyMDI2LTA5fGI4ZjMzNDQ4NjU= */
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/** 登录/注册限流：默认 5 次/分/IP；E2E 可经 E2E_RATE_LIMIT 环境变量豁免（生产/开发不设该变量，不受影响） */
const AUTH_RATE_LIMIT = Number(process.env.E2E_RATE_LIMIT ?? '5') || 5;

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
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
