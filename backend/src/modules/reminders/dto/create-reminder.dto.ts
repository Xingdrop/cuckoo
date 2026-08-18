import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  IntervalUnit,
  ReminderCategory,
  RepeatType,
} from '../reminder.entity';

export class RepeatRuleDto {
  @IsEnum(RepeatType)
  type: RepeatType;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  intervalValue?: number;

  @IsOptional()
  @IsEnum(IntervalUnit)
  intervalUnit?: IntervalUnit;
}

export class ReminderContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  jumpTo?: string;
}

export class ReminderMethodDto {
  @IsOptional()
  @IsBoolean()
  fullScreen?: boolean;

  @IsOptional()
  @IsString()
  sound?: string;

  @IsOptional()
  @IsBoolean()
  vibrationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  gradualSound?: boolean;
}

export class DelaySettingsDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  presetOptions?: number[];

  @IsOptional()
  @IsBoolean()
  customEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxDelayCount?: number;
}

export class ChallengeDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  allowGallery?: boolean;
}

export class CreateReminderDto {
  @IsEnum(ReminderCategory)
  category: ReminderCategory;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  title: string;

  @ValidateNested()
  @Type(() => RepeatRuleDto)
  @IsObject()
  repeatRule: RepeatRuleDto;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderContentDto)
  content?: ReminderContentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderMethodDto)
  method?: ReminderMethodDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DelaySettingsDto)
  delaySettings?: DelaySettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChallengeDto)
  challenge?: ChallengeDto;

  @IsOptional()
  @IsString()
  medicineId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
