import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { UserSetting } from '../users/user-setting.entity';
import { User } from '../users/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSetting)
    private readonly settingRepo: Repository<UserSetting>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
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

    return this.buildAuthResponse(user);
  }

  /** 登录：校验密码 → 签发 JWT */
  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { username: dto.username } });
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '用户名或密码错误' });
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: '用户名或密码错误' });
    }
    return this.buildAuthResponse(user);
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
