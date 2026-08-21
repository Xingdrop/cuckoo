import { BadRequestException, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import * as fs from 'node:fs';
import { FilesController } from './files.controller';

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * 上传模块：multer 配置集中在此（大小上限来自配置 MAX_FILE_SIZE，目录来自 UPLOAD_DIR）。
 * 校验策略（技术方案 §8.1 三重校验）：扩展名 + MIME 白名单（本处）+ 魔数校验（controller 收尾）。
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
        limits: { fileSize: config.get<number>('upload.maxFileSize') ?? 10 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          if (!ALLOWED_EXT.includes(ext) || !file.mimetype.startsWith('image/')) {
            cb(
              new BadRequestException({ code: 'VALIDATION_FAILED', message: '仅支持 jpg/png/webp 图片' }),
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
