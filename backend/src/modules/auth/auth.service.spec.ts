/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9hdXRoL2F1dGguc2VydmljZS5zcGVjLnRzfDIwMjYtMDl8MmVkOWYwNzQ4NQ== */ */
import { ConflictException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';

describe('AuthService（UT-AUTH）', () => {
  let service: AuthService;
  let userRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  const jwtSign = jest.fn().mockReturnValue('fake-jwt-token');
  const auditRecord = jest.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    jest.useRealTimers();
    auditRecord.mockClear();
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
        {
          provide: AuditService,
          useValue: { record: auditRecord },
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

  it('UT-AUTH-04a 连续失败 5 次 → 第 6 次登录被锁定（429 RATE_LIMITED）', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'u1', username: 'alice', passwordHash: await bcrypt.hash('password123', 10),
    });
    // 前 5 次失败（密码错误）
    for (let i = 0; i < 5; i++) {
      await expect(
        service.login({ username: 'alice', password: 'wrong-pass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    // 第 6 次即使密码正确也被锁定
    let caught: unknown;
    try {
      await service.login({ username: 'alice', password: 'password123' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((caught as HttpException).getResponse()).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('UT-AUTH-04b 锁定 15 分钟窗口过期后可再次尝试（不再返回 RATE_LIMITED）', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-29T00:00:00Z'));
    userRepo.findOne.mockResolvedValue({
      id: 'u1', username: 'alice', passwordHash: await bcrypt.hash('password123', 10),
    });
    for (let i = 0; i < 5; i++) {
      await expect(
        service.login({ username: 'alice', password: 'wrong-pass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    // 窗口未过期仍锁定
    let locked: unknown;
    try {
      await service.login({ username: 'alice', password: 'password123' });
    } catch (e) {
      locked = e;
    }
    expect((locked as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    // 推进 16 分钟后可再次尝试（锁定解除，登录成功）
    jest.setSystemTime(new Date('2026-08-29T00:16:00Z'));
    await expect(
      service.login({ username: 'alice', password: 'password123' }),
    ).resolves.toMatchObject({ token: 'fake-jwt-token' });
    jest.useRealTimers();
  });

  it('UT-AUTH-09 注册/登录写审计日志', async () => {
    userRepo.findOne.mockResolvedValue(null);
    userRepo.create.mockImplementation((x: unknown) => x);
    userRepo.save.mockImplementation(async (x: unknown) => x);
    await service.register({ username: 'audit-user', password: 'password123' });
    expect(auditRecord).toHaveBeenCalledWith('user.register', expect.any(String), expect.anything());

    userRepo.findOne.mockResolvedValue({
      id: 'u9', username: 'audit-user', passwordHash: await bcrypt.hash('password123', 10),
    });
    await service.login({ username: 'audit-user', password: 'password123' });
    expect(auditRecord).toHaveBeenCalledWith('user.login', 'u9');
  });
});
