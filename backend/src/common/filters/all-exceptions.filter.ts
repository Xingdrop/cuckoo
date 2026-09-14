/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvY29tbW9uL2ZpbHRlcnMvYWxsLWV4Y2VwdGlvbnMuZmlsdGVyLnRzfDIwMjYtMDl8ZmNmOGQxNzJhMA== */ */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/** 统一错误响应：{ code, message, details }（规范见 docs/技术方案设计.md §6.2） */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ method: string; url: string }>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // NestJS ValidationPipe 错误 → VALIDATION_FAILED
      if (
        typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        Array.isArray((body as { message: unknown }).message)
      ) {
        response.status(status).json({
          code: 'VALIDATION_FAILED',
          message: '请求参数校验失败',
          details: (body as { message: unknown }).message,
        });
        return;
      }

      const code =
        typeof body === 'object' && body !== null && 'code' in body
          ? String((body as { code: unknown }).code)
          : this.codeFromStatus(status);

      response.status(status).json({
        code,
        message:
          typeof body === 'object' && body !== null && 'message' in body
            ? String((body as { message: unknown }).message)
            : exception.message,
      } satisfies ApiErrorBody);
      return;
    }

    // 未预期异常：不泄露堆栈
    this.logger.error(
      `未处理异常 ${request.method} ${request.url}: ${exception instanceof Error ? exception.stack : String(exception)}`,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    } satisfies ApiErrorBody);
  }

  private codeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      default:
        return 'BAD_REQUEST';
    }
  }
}
