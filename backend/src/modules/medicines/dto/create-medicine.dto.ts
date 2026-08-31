import { IsArray, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, ArrayMaxSize } from 'class-validator';

export class CreateMedicineDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  dosage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  administration?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  threshold?: number;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  instructions?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  /** #25：多张药品照片（上限 9 张） */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  photoUrls?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  deductionPerUse?: number;

  @IsOptional()
  notifyOnLowStock?: boolean;
}
