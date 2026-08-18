import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService（UT-AUTH）', () => {
  let service: AuthService;
  let userRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  const jwtSign = jest.fn().mockReturnValue('fake-jwt-token');

  beforeEach(async () => {
    userRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: 'UserRepository', useValue: userRepo },
        { provide: 'UserSettingRepository', useValue: { save: jest.fn(), create: (x: unknown) => x } },
        {
          provide: JwtService,
          useValue: { sign: jwtSign },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('7d') },
        },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('UT-AUTH-01 用户名重复 → CONFLICT', async () => {
    userRepo.findOne.mockResolvedValue({ id: 'u1', username: 'dup' });
    await expect(
      service.register({ username: 'dup', password: 'password123' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('UT-AUTH-01b 注册成功 → 返回 token 与脱敏用户', async () => {
    userRepo.findOne.mockResolvedValue(null);
    userRepo.create.mockImplementation((x: unknown) => x);
    userRepo.save.mockImplementation(async (x: unknown) => x);
    const result = await service.register({ username: 'newbie', password: 'password123' });
    expect(result.token).toBe('fake-jwt-token');
    expect(result.user.username).toBe('newbie');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('UT-AUTH-03 登录成功签发 token', async () => {
    const hash = await bcrypt.hash('password123', 10);
    userRepo.findOne.mockResolvedValue({
      id: 'u1', username: 'alice', passwordHash: hash,
    });
    const result = await service.login({ username: 'alice', password: 'password123' });
    expect(result.token).toBe('fake-jwt-token');
    expect(jwtSign).toHaveBeenCalledWith(
      { sub: 'u1', username: 'alice' },
      expect.anything(),
    );
  });

  it('UT-AUTH-03b 密码错误 → UNAUTHORIZED', async () => {
    const hash = await bcrypt.hash('password123', 10);
    userRepo.findOne.mockResolvedValue({
      id: 'u1', username: 'alice', passwordHash: hash,
    });
    await expect(
      service.login({ username: 'alice', password: 'wrong-pass' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('UT-AUTH-08 密码哈希不可逆（库中无明文）', async () => {
    const hash = await bcrypt.hash('password123', 10);
    expect(hash).not.toContain('password123');
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt 格式
    // 同一密码两次哈希不同（盐随机）
    const hash2 = await bcrypt.hash('password123', 10);
    expect(hash).not.toBe(hash2);
  });
});
