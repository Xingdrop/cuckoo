import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import * as fs from 'node:fs';
import sharp from 'sharp';

const ALLOWED = ['.jpg', '.jpeg', '.png', '.webp'];

/** 文件上传：图片压缩 + 缩略图（拍照打卡/头像/帖子媒体） */
@ApiTags('文件')
@Controller('files')
export class FilesController {
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads');
          const month = new Date().toISOString().slice(0, 7).replace('-', '');
          const target = join(dir, month);
          fs.mkdirSync(target, { recursive: true });
          cb(null, target);
        },
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!ALLOWED.includes(ext) || !file.mimetype.startsWith('image/')) {
          cb(new BadRequestException({ code: 'VALIDATION_FAILED', message: '仅支持 jpg/png/webp 图片' }), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({ summary: '上传图片（拍照打卡等）' })
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '缺少文件' });
    }
    // sharp 压缩（去 EXIF）并生成缩略图
    const ext = extname(file.path).toLowerCase();
    const compressedPath = file.path.replace(ext, `${ext}.webp`);
    try {
      await sharp(file.path)
        .rotate()
        .resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(compressedPath);
      const thumbPath = file.path.replace(ext, `_thumb${ext}.webp`);
      await sharp(file.path)
        .rotate()
        .resize({ width: 400, withoutEnlargement: true })
        .webp({ quality: 70 })
        .toFile(thumbPath);
      // 删除原图（压缩版替代）
      fs.unlinkSync(file.path);

      const rel = (p: string) => `/uploads/${p.split('uploads')[1].replace(/\\/g, '/')}`;
      return {
        url: rel(compressedPath),
        thumbUrl: rel(thumbPath),
      };
    } catch {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '图片处理失败' });
    }
  }
}
