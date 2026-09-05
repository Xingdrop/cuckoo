/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvY29tbW9uL2RlY29yYXRvcnMvcHVibGljLmRlY29yYXRvci50c3wyMDI2LTA5fGU1MjRmZTI0ZjM= */
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 标记接口为公开（跳过 JWT 鉴权），如注册/登录/健康检查 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
