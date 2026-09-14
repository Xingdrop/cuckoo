/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbW9kdWxlcy9maWxlcy9maWxlcy5jb250cm9sbGVyLnRzfDIwMjYtMDl8MmQ4NWUyZGZlMQ== */
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, dirname, basename, join } from 'node:path';
import * as fs from 'node:fs';
import sharp from 'sharp';
import { hasValidImageSignature } from '../../common/image-signature';

const VIDEO_EXT = ['.mp4', '.webm'];

/**
 * 文件上传：图片压缩 + 缩略图（拍照打卡/头像/帖子媒体）| 视频直存（2026-08）。
 * 图片：扩展名/MIME（MulterModule）+ 魔数 + sharp 重编码（去 EXIF），失败清理。
 * 视频：扩展名/MIME 校验 + 直存（无转码），返回 url（thumbUrl 为空）。
 */
@ApiTags('文件')
@Controller('files')
export class FilesController {
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: '上传图片/视频（帖子媒体等）' })
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '缺少文件' });
    }

    const ext = extname(file.originalname).toLowerCase();
    const rel = (p: string) => `/uploads${p.split('uploads')[1].replace(/\\/g, '/')}`;

    // ===== 视频：直接返回（无转码；thumbUrl 为空）=====
    if (VIDEO_EXT.includes(ext)) {
      if (file.size > 60 * 1024 * 1024) {
        fs.unlinkSync(file.path);
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '视频不能超过 60MB' });
      }
      return { url: rel(file.path), thumbUrl: null, type: 'video' };
    }

    // ===== 图片：大小/魔数校验 + sharp 压缩 =====
    if (file.size > 10 * 1024 * 1024) {
      fs.unlinkSync(file.path);
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '图片不能超过 10MB' });
    }
    let source: Buffer;
    try {
      // 一次性读入内存（≤10MB）：后续魔数校验与 sharp 共用；sharp 持有路径句柄时
      // Windows 下立即 unlink 会 EBUSY，用 Buffer 可保证删源文件安全
      source = fs.readFileSync(file.path);
    } catch {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '文件读取失败' });
    }
    if (!hasValidImageSignature(source.subarray(0, 16))) {
      fs.unlinkSync(file.path);
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '文件内容不是有效的 jpg/png/webp 图片' });
    }

    // 输出文件名统一为 .webp：源文件若是 .webp 会同名，直接 toFile 会触发
    // sharp "Cannot use same file for input and output"，导致前端压缩图全部上传失败
    const dir = dirname(file.path);
    const name = basename(file.path, ext);
    const compressedPath = join(dir, `${name}.webp`);
    const thumbPath = join(dir, `${name}_thumb.webp`);
    try {
      // failOn('truncated')：与浏览器渲染行为一致——接受轻微损坏（CRC 警告/截断）但可显示的图片
      const image = sharp(source, { failOn: 'truncated' }).rotate();
      const [compressed, thumb] = await Promise.all([
        image.clone().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
        image.clone().resize({ width: 400, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer(),
      ]);
      fs.unlinkSync(file.path);
      fs.writeFileSync(compressedPath, compressed);
      fs.writeFileSync(thumbPath, thumb);
    } catch {
      for (const p of [file.path, compressedPath, thumbPath]) {
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {
          /* 忽略清理失败 */
        }
      }
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: '图片处理失败' });
    }

    return {
      url: rel(compressedPath),
      thumbUrl: rel(thumbPath),
      type: 'image',
    };
  }
}
