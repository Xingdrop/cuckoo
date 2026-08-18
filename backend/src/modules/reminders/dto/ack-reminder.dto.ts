import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ReminderLogStatus } from '../reminder-log.entity';

/** 提醒执行上报（本地通道执行后调用，幂等：UNIQUE(reminderId, scheduledTime)） */
export class AckReminderDto {
  @IsEnum(ReminderLogStatus)
  status: ReminderLogStatus;

  /** 本次计划触发时间（客户端上报，防时区偏差） */
  @IsString()
  scheduledTime: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  delayMinutes?: number;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}
