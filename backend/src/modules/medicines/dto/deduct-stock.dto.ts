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
