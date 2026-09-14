/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9hcHAtZG93bmxvYWQvYXBwLWRvd25sb2FkLm1vZHVsZS50c3wyMDI2LTA5fDY2ODUwZTZkYjA= */ */
import { Module } from '@nestjs/common';
import { AppDownloadController } from './app-download.controller';

/** App 下载（公开路由，无数据依赖） */
@Module({
  controllers: [AppDownloadController],
})
export class AppDownloadModule {}
