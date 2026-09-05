/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9hdXRoL2p3dC5zdHJhdGVneS50c3wyMDI2LTA5fDNkNjQwOWNiY2I= */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { JwtPayload } from '../../common/guards/jwt-auth.guard';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret') ?? 'please-change-me-in-production',
    });
  }

  /** 校验用户存在且未注销：注销后旧 token 立即失效（AC-106） */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // 显式 withDeleted 查询并判断 deletedAt（TypeORM 1.1.0 的 find 不保证自动过滤软删除）
    const user = await this.userRepo.findOne({ where: { id: payload.sub }, withDeleted: true });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '账号已注销或不存在' });
    }
    return { sub: user.id, username: user.username };
  }
}
