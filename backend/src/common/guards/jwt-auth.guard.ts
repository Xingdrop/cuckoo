/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvY29tbW9uL2d1YXJkcy9qd3QtYXV0aC5ndWFyZC50c3wyMDI2LTA5fDc1MGFlNzJjNDE= */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../modules/users/user.entity';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export interface JwtPayload {
  sub: string;
  username: string;
}

/**
 * JWT 鉴权守卫：校验 Authorization: Bearer <token>。
 * 用 @Public() 标记的接口跳过鉴权。
 * 校验用户仍存在且未注销（注销后旧 token 立即失效，AC-106）。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: JwtPayload;
    }>();
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '未登录或 token 缺失' });
    }
    const token = auth.slice(7);
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      // 注销后 token 立即失效：显式 withDeleted 查询并判断（防软删除用户继续访问）
      const user = await this.userRepo.findOne({ where: { id: payload.sub }, withDeleted: true });
      if (!user || user.deletedAt) {
        throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '账号已注销或不存在' });
      }
      request.user = payload;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '登录已过期，请重新登录' });
    }
  }
}
