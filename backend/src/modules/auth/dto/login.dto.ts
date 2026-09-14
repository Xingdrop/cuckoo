/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9hdXRoL2R0by9sb2dpbi5kdG8udHN8MjAyNi0wOXwzNDI5NTFmMDVi */ */
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MaxLength(24)
  username: string;

  @IsString()
  @MinLength(1)
  password: string;
}
