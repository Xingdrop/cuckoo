/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9maWxlcy9maWxlcy5tb2R1bGUudHN8MjAyNi0wOXwwYzMxM2Y0ZmY1 */ */
import { BadRequestException, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import * as fs from 'node:fs';
import { FilesController } from './files.controller';

/** 图片 */
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
/** 视频（2026-08：#8 帖子支持视频） */
const VIDEO_EXT = ['.mp4', '.webm'];
const ALLOWED_EXT = [...IMAGE_EXT, ...VIDEO_EXT];

/**
 * 上传模块：multer 配置集中在此（大小上限来自配置 MAX_FILE_SIZE，目录来自 UPLOAD_DIR）。
 * 校验策略（技术方案 §8.1 三重校验）：扩展名 + MIME 白名单（本处）+ 魔数校验（controller 收尾，仅图片）。
 */
@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: diskStorage({
          destination: (_req, _file, cb) => {
            const dir = join(process.cwd(), config.get<string>('upload.dir') ?? 'uploads');
            const month = new Date().toISOString().slice(0, 7).replace('-', '');
            const target = join(dir, month);
            fs.mkdirSync(target, { recursive: true });
            cb(null, target);
          },
          filename: (_req, file, cb) => {
            cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
          },
        }),
        // 全局兜底上限（配置项 MAX_FILE_SIZE，默认 10MB）；
        // 业务级限制在 controller 按类型收紧：图片 10MB / 视频 60MB
        limits: {
          fileSize: Number(process.env.MAX_FILE_SIZE ?? '10485760') || 10 * 1024 * 1024,
        },
        fileFilter: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          const isImage = IMAGE_EXT.includes(ext) && file.mimetype.startsWith('image/');
          const isVideo = VIDEO_EXT.includes(ext) && file.mimetype.startsWith('video/');
          if (!isImage && !isVideo) {
            cb(
              new BadRequestException({ code: 'VALIDATION_FAILED', message: '仅支持 jpg/png/webp 图片或 mp4/webm 视频' }),
              false,
            );
            return;
          }
          cb(null, true);
        },
      }),
    }),
  ],
  controllers: [FilesController],
})
export class FilesModule {}
