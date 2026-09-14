// /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbWFpbi50c3wyMDI2LTA4fDg5NDhiM2RiODg= */
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // 安全头。2026-09-08：CORP 放开为 cross-origin——helmet 默认 same-origin 会让
  // APK WebView（https://localhost 页面）跨源加载局域网 /uploads 媒体时被
  // Chromium 按 CORP/ORB 拦截（net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin）。
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // CORS 必须先于静态资源注册：/uploads 响应需带 Access-Control-Allow-Origin，
  // 否则 APK 内「fetch 图片 → blob 渲染」兜底链路被 CORS 拦截（静态文件无 CORS 头）。
  // CORS：#26 开发环境放开任意来源（APK capacitor://localhost / 手机浏览器局域网测试）；生产用白名单
  if (config.get('env') !== 'production') {
    app.enableCors({ origin: true });
  }

  // 上传文件静态访问（/uploads/xxx.webp）
  app.useStaticAssets(join(process.cwd(), config.get<string>('upload.dir') ?? 'uploads'), {
    prefix: '/uploads/',
    // 导出报告是服务端拼接的 HTML（含用户可写字段）→ 加 CSP 兜底：
    // 即使将来某字段漏转义，脚本也被 default-src 'none' 挡住（2026-09-14 安全加固）
    setHeaders: (res, filePath) => {
      if (/[/\\]exports[/\\]/.test(filePath)) {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
        );
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }
    },
  });

  if (config.get('env') === 'production') {
    app.enableCors({ origin: config.get<string[]>('corsOrigins') });
  }

  // 全局校验管道：DTO class-validator 校验失败 → 400 VALIDATION_FAILED
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 全局异常过滤器：错误码归一化（见 docs/技术方案设计.md §6.2）
  app.useGlobalFilters(new AllExceptionsFilter());

  // 全局路由前缀
  app.setGlobalPrefix('api/v1');

  // OpenAPI 文档（生产可关闭）
  if (config.get<string>('env') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('布谷 Cuckoo API')
      .setDescription('智能提醒与健康管理 API 文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, document);
  }

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[Cuckoo] API 已启动: http://localhost:${port}/api/v1`);
}

void bootstrap();
