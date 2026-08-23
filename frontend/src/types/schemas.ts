import { z } from 'zod';

/**
 * 表单校验 schema（技术方案 §3.1「Zod 前后端共享校验」）。
 * 与后端 DTO 校验语义保持一致：
 * - username：2~24 位（与 backend RegisterDto 一致）
 * - password：注册 8~64 位（与 backend RegisterDto 一致）；登录仅要求非空（兼容老数据）
 */

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, '用户名至少 2 个字符')
    .max(24, '用户名最多 24 个字符'),
  password: z.string().min(1, '请输入密码').max(64, '密码最多 64 位'),
});

export const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(2, '用户名至少 2 个字符')
      .max(24, '用户名最多 24 个字符'),
    password: z.string().min(8, '密码至少 8 位').max(64, '密码最多 64 位'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: '两次输入的密码不一致',
    path: ['confirm'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
