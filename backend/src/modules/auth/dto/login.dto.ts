import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MaxLength(24)
  username: string;

  @IsString()
  @MinLength(1)
  password: string;
}
