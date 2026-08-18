import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export interface JwtPayload {
  sub: string;
  username: string;
}

/**
 * JWT 鉴权守卫：校验 Authorization: Bearer <token>。
 * 用 @Public() 标记的接口跳过鉴权。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
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
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '登录已过期，请重新登录' });
    }
  }
}
