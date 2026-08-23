import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '../../src/types/schemas';

describe('schemas（zod 表单校验，与后端 DTO 对齐）', () => {
  it('loginSchema：合法输入通过，空密码/短用户名拒绝', () => {
    expect(loginSchema.safeParse({ username: 'alice', password: 'p' }).success).toBe(true);
    expect(loginSchema.safeParse({ username: 'a', password: 'p' }).success).toBe(false);
    expect(loginSchema.safeParse({ username: 'alice', password: '' }).success).toBe(false);
  });

  it('registerSchema：密码至少 8 位', () => {
    expect(registerSchema.safeParse({ username: 'alice', password: '1234567', confirm: '1234567' }).success).toBe(false);
    expect(
      registerSchema.safeParse({ username: 'alice', password: 'password123', confirm: 'password123' }).success,
    ).toBe(true);
  });

  it('registerSchema：两次密码不一致 → 拒绝且错误信息可读', () => {
    const r = registerSchema.safeParse({ username: 'alice', password: 'password123', confirm: 'password124' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path).toEqual(['confirm']);
    }
  });

  it('用户名校验与后端一致（2~24 位、空白裁剪）', () => {
    expect(loginSchema.safeParse({ username: '  alice  ', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ username: 'a'.repeat(25), password: 'x' }).success).toBe(false);
  });
});
