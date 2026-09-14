/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9tZWRpY2luZXMvZHRvL2RlZHVjdC1zdG9jay5kdG8udHN8MjAyNi0wOXwyMGY0ZGVjMjg1 */
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** 手动扣减库存 / PRN 按需记录 */
export class DeductStockDto {
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
