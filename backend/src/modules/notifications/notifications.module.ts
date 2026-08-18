import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './device.entity';
import { DevicesController } from './devices.controller';
import { PushService } from './push.service';
import { NotificationLog } from './notification-log.entity';
import { Notification } from './notification.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Device, Notification, NotificationLog])],
  controllers: [DevicesController],
  providers: [PushService],
  exports: [PushService],
})
export class NotificationsModule {}
