import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2, { message: '用户名至少 2 个字符' })
  @MaxLength(24, { message: '用户名最多 24 个字符' })
  @Matches(/^[\w\u4e00-\u9fa5-]+$/, { message: '用户名仅支持中文、字母、数字、下划线、连字符' })
  username: string;

  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(64, { message: '密码最多 64 位' })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  phone?: string;

  @IsOptional()
  @IsString({ each: true })
  healthGoals?: string[];
}
