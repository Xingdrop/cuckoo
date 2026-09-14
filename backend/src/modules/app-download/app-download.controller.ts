/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9hcHAtZG93bmxvYWQvYXBwLWRvd25sb2FkLmNvbnRyb2xsZXIudHN8MjAyNi0wOXw2OTk2M2E0YTlk */ */
import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createReadStream, existsSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { Public } from '../../common/decorators/public.decorator';

/** APK 路径：默认指向前端 Android 构建产物（重新构建后自动为"最新"），可用 APP_APK_PATH 覆盖 */
const APK_PATH = process.env.APP_APK_PATH
  ? path.resolve(process.env.APP_APK_PATH)
  : path.resolve(process.cwd(), '../frontend/android/app/build/outputs/apk/debug/app-debug.apk');

/**
 * App 下载：设置页「下载 App」入口（公开路由——未注册用户也需要下载）。
 * info 供设置页展示包大小/构建时间；download 流式返回 APK。
 */
@ApiTags('App 下载')
@Controller('app')
export class AppDownloadController {
  @Public()
  @Get('info')
  @ApiOperation({ summary: '查询最新 APK 信息' })
  info() {
    if (!existsSync(APK_PATH)) return { available: false };
    const st = statSync(APK_PATH);
    return { available: true, sizeBytes: st.size, updatedAt: st.mtime.toISOString() };
  }

  @Public()
  @Get('download')
  @ApiOperation({ summary: '下载最新 APK' })
  download(@Res() res: import('express').Response) {
    if (!existsSync(APK_PATH)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '安装包尚未构建，请先构建 APK' });
    }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="cuckoo-app.apk"');
    createReadStream(APK_PATH).pipe(res);
  }
}
