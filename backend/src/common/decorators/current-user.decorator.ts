/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvY29tbW9uL2RlY29yYXRvcnMvY3VycmVudC11c2VyLmRlY29yYXRvci50c3wyMDI2LTA5fGFmYmIyOTZlOGI= */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../guards/jwt-auth.guard';

/** 获取当前登录用户（JwtAuthGuard 注入后的 payload） */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
