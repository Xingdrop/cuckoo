/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvbWFpbi50c3wyMDI2LTA4fDg5NDhiM2RiODg= */
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { isTrustedProxy } from './common/trusted-proxy';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // 安全头。2026-09-08：CORP 放开为 cross-origin——helmet 默认 same-origin 会让
  // APK WebView（https://localhost 页面）跨源加载局域网 /uploads 媒体时被
  // Chromium 按 CORP/ORB 拦截（net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin）。
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // 服务模式（SERVE_MODE）：lan=局域网自用 / public=对外提供服务（两种模式都监听全部网卡，
  // 局域网设备直连与隧道·反代对外可并存，见 docs/部署手册.md §4）
  const serveMode = config.get<'lan' | 'public'>('serveMode');

  // 对外服务：采信反向代理（Cloudflare Tunnel / Nginx）写入的 X-Forwarded-For，
  // 否则限流按 TCP 对端取 IP——隧道下所有访客都是 127.0.0.1，一人触发即全员被限。
  // 2026-09-17 加固：不再用无条件的 `trust proxy = 1`——本服务监听全部网卡，
  // 端口可直连时客户端自带 XFF 即可伪造 req.ip 绕过限流与登录防爆破。
  // 改为「只信任受信对端」：仅当 TCP 对端是回环（同机隧道/反代）或 TRUSTED_PROXIES 中的地址时才采信 XFF。
  if (serveMode === 'public') {
    const trustedProxies = config.get<string[]>('trustedProxies') ?? [];
    app
      .getHttpAdapter()
      .getInstance()
      .set('trust proxy', (ip: string) => isTrustedProxy(ip, trustedProxies));
  }

  // CORS 必须先于静态资源注册：/uploads 响应需带 Access-Control-Allow-Origin，
  // 否则 APK 内「fetch 图片 → blob 渲染」兜底链路被 CORS 拦截（静态文件无 CORS 头）。
  // lan：放开任意来源（局域网 IP 与手机热点随时变化）；public：白名单 + 固定放行 App 内建来源
  const allowedOrigins = [
    ...(config.get<string[]>('corsOrigins') ?? []),
    'capacitor://localhost',
    'https://localhost',
  ];
  app.enableCors({ origin: serveMode === 'public' ? allowedOrigins : true });

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

  // 前端 SPA 托管（可选）：frontend/dist 存在时，同一端口同时提供网页版与 API。
  // 对外服务时只需一条隧道 URL（同源，无 CORS 问题）；dist 不存在则跳过，仅提供 API。
  // 顺序要求：必须在 /api（控制器）与 /uploads 静态之后——先静态命中，未命中才回退 index.html。
  const spaDir = join(process.cwd(), config.get<string>('spa.dir') ?? '');
  if (existsSync(join(spaDir, 'index.html'))) {
    app.useStaticAssets(spaDir, { index: false });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const url = req.originalUrl || req.url;
      if (url.startsWith('/api') || url.startsWith('/uploads')) return next();
      res.sendFile(join(spaDir, 'index.html'));
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[Cuckoo] 未发现前端构建产物（${spaDir}），本次仅提供 API`);
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
  console.log(
    `[Cuckoo] API 已启动: http://localhost:${port}/api/v1 ｜ 服务模式: ${
      serveMode === 'public' ? 'public（对外服务·CORS 白名单）' : 'lan（局域网·CORS 放开）'
    }`,
  );
}

void bootstrap();
