/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvbW9kdWxlcy9yZW1pbmRlcnMvZHRvL2NyZWF0ZS1yZW1pbmRlci5kdG8udHN8MjAyNi0wOXwxNWI4YTA5MTRk */
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
  Matches,
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

  /** 每次喝水量（ml，water 分类） */
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(1000)
  waterAmountMl?: number;

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

  /** 自定义分类名称（category=custom 时生效） */
  @IsOptional()
  @IsString()
  @MaxLength(12)
  categoryLabel?: string;

  /** 喝水每日目标（ml，water 分类时保存到用户设置） */
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10000)
  waterGoalMl?: number;

  /** 自定义分类图标（emoji） */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  categoryIcon?: string;

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

  /** 每日多时间点（HH:mm），daily/weekly 适用，最多 10 个；daily 留空即"不定时" */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { each: true, message: '时间格式须为 HH:mm' })
  times?: string[];

  /** 所属计划（2026-08："我的计划"内添加提醒时附带） */
  @IsOptional()
  @IsString()
  planId?: string;

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

  /** #20：是否计入完成率（默认 true；今日完成率方框可逐条勾选） */
  @IsOptional()
  @IsBoolean()
  countInRate?: boolean;
}
