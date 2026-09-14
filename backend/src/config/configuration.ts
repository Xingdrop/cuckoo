/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YmFja2VuZC9zcmMvY29uZmlnL2NvbmZpZ3VyYXRpb24udHN8MjAyNi0wOXw2MDBiMWZmNzRk */
/**
 * 全局配置：环境变量加载与校验。
 * 所有可转移参数集中在此读取，字段与 .env.example 一一对应。
 * 新增参数时必须同步 .env.example 与 docs/技术方案设计.md §9。
 */
/** JWT 密钥默认值（仅开发/测试可用；生产环境必须显式配置强密钥） */
export const DEFAULT_JWT_SECRET = 'please-change-me-in-production';

/**
 * 解析 JWT 密钥（2026-09-14 安全加固）。
 * 生产环境缺失/使用默认值/长度不足 → 直接抛错拒绝启动：
 * 否则默认弱密钥是公开的，任何人都能离线签发任意 userId 的合法 token。
 */
export function resolveJwtSecret(env: string): string {
  const secret = process.env.JWT_SECRET ?? '';
  if (env === 'production') {
    if (!secret || secret === DEFAULT_JWT_SECRET || secret.length < 32) {
      throw new Error(
        '生产环境必须设置 JWT_SECRET（长度 ≥ 32 且不得为默认值）：拒绝启动，请检查 .env',
      );
    }
    return secret;
  }
  if (!secret) {
    // eslint-disable-next-line no-console
    console.warn('[Cuckoo] 未设置 JWT_SECRET，开发环境使用默认弱密钥（生产环境会拒绝启动）');
    return DEFAULT_JWT_SECRET;
  }
  return secret;
}

const ENV = process.env.NODE_ENV ?? 'development';

export default () => ({
  env: ENV,
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),

  db: {
    path: process.env.DB_PATH ?? 'data/cuckoo.sqlite',
    wal: (process.env.DB_WAL ?? 'true') === 'true',
  },

  jwt: {
    secret: resolveJwtSecret(ENV),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },

  upload: {
    dir: process.env.UPLOAD_DIR ?? 'uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE ?? '10485760', 10),
  },

  push: {
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:admin@cuckoo.example.com',
  },

  jobs: {
    missedScanIntervalMs: parseInt(process.env.MISSED_SCAN_INTERVAL_MS ?? '60000', 10),
    weeklyReportCron: process.env.WEEKLY_REPORT_CRON ?? '0 8 * * 1',
    monthlyReportCron: process.env.MONTHLY_REPORT_CRON ?? '0 8 1 * *',
  },

  sms: {
    provider: process.env.SMS_PROVIDER ?? 'none',
  },

  seed: {
    demoData: (process.env.SEED_DEMO_DATA ?? 'true') === 'true',
  },
});
