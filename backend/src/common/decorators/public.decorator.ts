import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 标记接口为公开（跳过 JWT 鉴权），如注册/登录/健康检查 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
