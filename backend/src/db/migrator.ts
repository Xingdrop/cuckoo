/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvZGIvbWlncmF0b3IudHN8MjAyNi0xMXw3NWQxZGQwZjYy */
import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { migrations, type Migration } from './migrations';

export interface MigrateResult {
  applied: string[];
  backup: string | null;
}

interface MigrateOptions {
  dbPath?: string;
  backupDir?: string;
  logger?: (message: string) => void;
}

const KEEP_BACKUPS = 5;

/** 迁移前后都用事务 + 外键校验兜底；失败即抛错阻止启动 */
export async function runMigrations(options: MigrateOptions = {}): Promise<MigrateResult> {
  const dbPath = resolve(process.cwd(), options.dbPath ?? process.env.DB_PATH ?? 'data/cuckoo.sqlite');
  const backupDir = resolve(
    process.cwd(),
    options.backupDir ?? process.env.DB_BACKUP_DIR ?? join(dirname(dbPath), 'backups'),
  );
  const log = options.logger ?? ((m: string) => console.log(`[Cuckoo][migrate] ${m}`));

  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  try {
    db.pragma('busy_timeout = 5000');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY NOT NULL, appliedAt TEXT NOT NULL)',
    );

    const done = new Set(
      (db.prepare('SELECT id FROM schema_migrations').all() as { id: string }[]).map((r) => r.id),
    );
    const pending: Migration[] = [...migrations]
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((m) => !done.has(m.id));

    if (!pending.length) {
      log('数据库结构已是最新，无需迁移');
      return { applied: [], backup: null };
    }

    const backup = await backupDatabase(db, dbPath, backupDir, log);

    for (const migration of pending) {
      // PRAGMA foreign_keys 不能在事务内切换
      db.pragma('foreign_keys = OFF');
      let inTransaction = false;
      try {
        db.exec('BEGIN');
        inTransaction = true;
        migration.up(db);
        db.exec('COMMIT');
        inTransaction = false;

        const fkErrors = db.pragma('foreign_key_check') as unknown[];
        if (fkErrors.length) {
          throw new Error(`外键校验失败（${fkErrors.length} 处）: ${JSON.stringify(fkErrors.slice(0, 5))}`);
        }
        const integrity = db.pragma('integrity_check') as { integrity_check: string }[];
        if (integrity[0]?.integrity_check !== 'ok') {
          throw new Error(`完整性校验失败: ${JSON.stringify(integrity.slice(0, 3))}`);
        }

        db.prepare('INSERT INTO schema_migrations (id, appliedAt) VALUES (?, ?)').run(
          migration.id,
          new Date().toISOString(),
        );
        log(`已应用迁移 ${migration.id}`);
      } catch (error) {
        if (inTransaction) {
          try {
            db.exec('ROLLBACK');
          } catch {
            // 事务已被 SQLite 自动回滚
          }
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`迁移 ${migration.id} 失败，已保留备份：${message}`);
      } finally {
        db.pragma('foreign_keys = ON');
      }
    }

    log(`迁移完成，共 ${pending.length} 个；备份：${backup}`);
    return { applied: pending.map((m) => m.id), backup };
  } finally {
    db.close();
  }
}

/** WAL 模式不能直接复制文件，使用 SQLite 在线备份 API 获取一致快照 */
async function backupDatabase(
  db: Database.Database,
  dbPath: string,
  backupDir: string,
  log: (message: string) => void,
): Promise<string> {
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const dest = join(backupDir, `cuckoo-${stamp}.sqlite`);
  await db.backup(dest);
  log(`迁移前备份已生成：${dest}`);

  const files = readdirSync(backupDir)
    .filter((f) => /^cuckoo-\d{8}-\d{6}\.sqlite$/.test(f))
    .map((f) => ({ f, t: statSync(join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const stale of files.slice(KEEP_BACKUPS)) {
    rmSync(join(backupDir, stale.f), { force: true });
  }

  // 备份文件名与库文件同名目录时避免误用
  if (resolve(dbPath) === resolve(dest)) {
    throw new Error('备份路径与数据库路径相同');
  }
  return dest;
}
