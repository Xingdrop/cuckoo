/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvZGIvbWlncmF0aW9ucy8wMDZfY2xlYW51cF9jb2x1bW5zLnRzfDIwMjYtMTF8MmQzMWZmODJhNQ== */
import type Database from 'better-sqlite3';
import type { Migration } from './types';

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  if (!exists) return false;
  return (db.pragma(`table_info(${table})`) as { name: string }[]).some((c) => c.name === column);
}

/**
 * P7：删除已被子表替代的旧数组列，以及无业务读取的死列。
 * 此迁移执行后旧构建无法直接回滚，只能使用迁移备份恢复。
 */
export const migration006: Migration = {
  id: '006_cleanup_columns',
  up(db) {
    const drops: [table: string, column: string][] = [
      ['reminders', 'times'],
      ['users', 'healthGoals'],
      ['medicines', 'photoUrl'],
      ['medicines', 'photoUrls'],
      ['exercises', 'imageUrls'],
    ];
    for (const [table, column] of drops) {
      if (hasColumn(db, table, column)) {
        db.exec(`ALTER TABLE "${table}" DROP COLUMN "${column}"`);
      }
    }

    // user_settings.waterInRate 被 003 的 CHECK 引用，SQLite 不允许直接 DROP COLUMN → 重建
    if (hasColumn(db, 'user_settings', 'waterInRate')) {
      db.exec(`
        CREATE TABLE "user_settings__new" (
          "userId" text PRIMARY KEY NOT NULL,
          "notificationEnabled" boolean NOT NULL DEFAULT 1,
          "soundEnabled" boolean NOT NULL DEFAULT 1,
          "vibrationEnabled" boolean NOT NULL DEFAULT 1,
          "theme" varchar NOT NULL DEFAULT 'default',
          "missedThresholdMinutes" integer NOT NULL DEFAULT 30,
          "showSkipButton" boolean NOT NULL DEFAULT 0,
          "maxDelayCount" integer NOT NULL DEFAULT 3,
          "waterGoalMl" integer NOT NULL DEFAULT 2000,
          "waterCountInRate" boolean NOT NULL DEFAULT 0,
          FOREIGN KEY ("userId") REFERENCES users ("id") ON DELETE CASCADE,
          CHECK ("notificationEnabled" IN (0, 1)),
          CHECK ("soundEnabled" IN (0, 1)),
          CHECK ("vibrationEnabled" IN (0, 1)),
          CHECK ("showSkipButton" IN (0, 1)),
          CHECK ("waterCountInRate" IN (0, 1)),
          CHECK ("missedThresholdMinutes" >= 0),
          CHECK ("maxDelayCount" >= 0),
          CHECK ("waterGoalMl" >= 0)
        );
        INSERT INTO "user_settings__new" (
          "userId", "notificationEnabled", "soundEnabled", "vibrationEnabled", "theme",
          "missedThresholdMinutes", "showSkipButton", "maxDelayCount", "waterGoalMl", "waterCountInRate"
        )
        SELECT
          "userId", "notificationEnabled", "soundEnabled", "vibrationEnabled", "theme",
          "missedThresholdMinutes", "showSkipButton", "maxDelayCount", "waterGoalMl", "waterCountInRate"
        FROM "user_settings";
        DROP TABLE "user_settings";
        ALTER TABLE "user_settings__new" RENAME TO "user_settings";
      `);
    }
  },
};
