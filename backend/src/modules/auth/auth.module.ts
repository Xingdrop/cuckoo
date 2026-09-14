/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9hdXRoL2F1dGgubW9kdWxlLnRzfDIwMjYtMDl8ODViNWZiNTljYQ== */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { UserSetting } from '../users/user-setting.entity';
import { User } from '../users/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSetting]),
    AuditModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // 生产环境密钥强度由 configuration.ts#resolveJwtSecret 保证；此处不兜底弱密钥
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: { expiresIn: (config.get<string>('jwt.expiresIn') ?? '7d') as never },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
