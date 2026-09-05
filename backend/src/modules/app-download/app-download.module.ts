import { Module } from '@nestjs/common';
import { AppDownloadController } from './app-download.controller';

/** App 下载（公开路由，无数据依赖） */
@Module({
  controllers: [AppDownloadController],
})
export class AppDownloadModule {}
