/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL3R5cGVzL3NjaGVtYXMudHN8MjAyNi0wOXw1YzVhOTFjZTU3 */ */
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

/** 亲友绑定邀请码（与 backend BindByCodeDto 一致：6 位、去易混淆字符） */
export const bindCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[2-9A-HJKMNP-Z]{6}$/, '邀请码为 6 位字母数字（不含 0/O/1/I/L）'),
});
export type BindCodeInput = z.infer<typeof bindCodeSchema>;

/** 亲友聊天消息（与 backend SendMessageDto 一致：文本 ≤500 字，图片须 /uploads/ 路径） */
export const chatMessageSchema = z
  .object({
    content: z.string().trim().max(500, '消息不能超过 500 字'),
    photoUrl: z
      .string()
      .regex(/^\/uploads\//, '图片地址无效')
      .nullable()
      .optional(),
  })
  .refine((d) => d.content.length > 0 || d.photoUrl, { message: '消息不能为空' });
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

/** 亲友联系人（与 backend ContactDto 一致） */
export const contactSchema = z.object({
  name: z.string().trim().min(1, '姓名不能为空').max(50, '姓名最多 50 字'),
  phone: z.string().trim().max(20, '电话最多 20 位').nullable().optional(),
  relation: z.string().trim().max(20, '关系最多 20 字').nullable().optional(),
  appUserId: z.string().uuid('须选择有效的布谷账户').nullable().optional(),
  receiveLowStock: z.boolean().optional(),
  receiveMissed: z.boolean().optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;
