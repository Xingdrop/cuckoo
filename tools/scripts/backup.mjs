#!/usr/bin/env node
/**
 * 布谷（Cuckoo）SQLite 备份脚本（跨平台：Node + better-sqlite3 的 .backup，WAL 安全）。
 * 用法：node tools/scripts/backup.mjs [备份目录] [保留份数]
 * 在 backend/ 目录运行（需要能 require backend/node_modules/better-sqlite3）；
 * 建议 cron：0 2 * * * cd /opt/cuckoo/backend && node ../tools/scripts/backup.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(resolve(process.cwd(), 'package.json'));
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH ?? 'data/cuckoo.sqlite';
const BACKUP_DIR = process.argv[2] ?? 'backups';
const KEEP = Number(process.argv[3] ?? 14);

if (!DB_PATH || !require('node:fs').existsSync(DB_PATH)) {
  console.error(`[backup] 错误：找不到数据库文件 ${DB_PATH}（请在 backend/ 目录运行）`);
  process.exit(1);
}

mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const out = join(BACKUP_DIR, `cuckoo-${stamp}.sqlite`);

const db = new Database(DB_PATH, { readonly: true });
await db.backup(out); // .backup() 在 WAL 模式下是安全快照
db.close();

// 清理过期备份（保留最近 KEEP 份）
const files = readdirSync(BACKUP_DIR)
  .filter((f) => /^cuckoo-.*\.sqlite$/.test(f))
  .map((f) => ({ f, mtime: statSync(join(BACKUP_DIR, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);
for (const { f } of files.slice(KEEP)) rmSync(join(BACKUP_DIR, f));

console.log(`[backup] ${new Date().toISOString()} 备份完成：${out}（保留 ${KEEP} 份）`);
