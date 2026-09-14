/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9hdXRoL2F1dGguc2VydmljZS50c3wyMDI2LTA5fDVjNzgzNmFiYjY= */
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { UserSetting } from '../users/user-setting.entity';
import { User } from '../users/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 10;

/** 登录失败锁定策略（技术方案 §8.1：失败 5 次锁定 15 分钟；UT-AUTH-04） */
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60_000;

interface LoginFailEntry {
  count: number;
  lockedUntil: number;
}

@Injectable()
export class AuthService {
  /** 内存失败计数（单实例部署足够；多实例需换共享存储） */
  private readonly loginFailures = new Map<string, LoginFailEntry>();

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly settingRepo: Repository<UserSetting>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /** 注册：用户名唯一校验 + bcrypt 哈希 + 默认设置初始化 */
  async register(dto: RegisterDto) {
    const exists = await this.userRepo.findOne({ where: { username: dto.username } });
    if (exists) {
      throw new ConflictException({ code: 'CONFLICT', message: '用户名已被占用' });
    }

    const user = this.userRepo.create({
      id: randomUUID(),
      username: dto.username,
      phone: dto.phone ?? null,
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      healthGoals: dto.healthGoals ?? null,
    });
    await this.userRepo.save(user);
    await this.settingRepo.save(
      this.settingRepo.create({ userId: user.id }),
    );
    void this.audit.record('user.register', user.id, {
      detail: { username: user.username },
    });

    return this.buildAuthResponse(user);
  }

  /** 登录：校验密码 → 签发 JWT（失败 5 次锁定 15 分钟，UT-AUTH-04） */
  async login(dto: LoginDto, ip = '') {
    this.assertNotLocked(ip, dto.username);

    const user = await this.userRepo.findOne({ where: { username: dto.username } });
    if (!user) {
      this.recordLoginFailure(ip, dto.username);
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '用户名或密码错误' });
    }
    // passwordHash 为 select:false（防关系展开外泄），登录时单独窄查取回
    const cred = await this.userRepo.findOne({
      where: { id: user.id },
      select: { id: true, passwordHash: true },
    });
    const ok = cred?.passwordHash
      ? await bcrypt.compare(dto.password, cred.passwordHash)
      : false;
    if (!ok) {
      this.recordLoginFailure(ip, dto.username);
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '用户名或密码错误' });
    }

    this.loginFailures.delete(this.lockKey(ip, dto.username));
    void this.audit.record('user.login', user.id);
    return this.buildAuthResponse(user);
  }

  /**
   * 登录失败计数：达到上限进入锁定窗口（内存计数，单进程有效）。
   * 2026-09-14 安全修复：键改为「IP + 账号」——此前只按 username 计数，
   * 攻击者知道用户名即可用 5 次错密码把目标账号锁死 15 分钟（账号锁定 DoS）。
   * 注意：ip 传入的是客户端 IP（不限来源时用空串，退化为仅按账号，与旧行为一致）。
   */
  private lockKey(ip: string, username: string) {
    return `${ip}|${username.toLowerCase()}`;
  }

  private assertNotLocked(ip: string, username: string) {
    const key = this.lockKey(ip, username);
    const entry = this.loginFailures.get(key);
    if (!entry) return;
    // 已进入锁定窗口：未过期 → 拒绝登录；已过期 → 清除计数
    if (entry.lockedUntil > 0) {
      if (entry.lockedUntil > Date.now()) {
        throw new HttpException(
          { code: 'RATE_LIMITED', message: '登录失败次数过多，请 15 分钟后再试' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      this.loginFailures.delete(key);
    }
  }

  private recordLoginFailure(ip: string, username: string) {
    const key = this.lockKey(ip, username);
    const entry = this.loginFailures.get(key) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= LOGIN_MAX_ATTEMPTS) {
      entry.lockedUntil = Date.now() + LOGIN_LOCK_MS;
      entry.count = 0;
    }
    this.loginFailures.set(key, entry);
  }

  private buildAuthResponse(user: User) {
    const payload = { sub: user.id, username: user.username };
    return {
      token: this.jwtService.sign(payload, {
        expiresIn: (this.config.get<string>('jwt.expiresIn') ?? '7d') as never,
      }),
      user: this.toPublic(user),
    };
  }

  /** 脱敏用户信息（不返回密码哈希） */
  toPublic(user: User) {
    return {
      id: user.id,
      username: user.username,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      healthGoals: user.healthGoals,
      timezone: user.timezone,
      createdAt: user.createdAt,
    };
  }
}
