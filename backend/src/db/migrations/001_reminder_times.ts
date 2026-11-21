/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvZGIvbWlncmF0aW9ucy8wMDFfcmVtaW5kZXJfdGltZXMudHN8MjAyNi0xMXxhYTZiMWRmMTkz */
import type Database from 'better-sqlite3';
import type { Migration } from './types';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function hasTable(db: Database.Database, table: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
  );
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  if (!hasTable(db, table)) return false;
  return (db.pragma(`table_info(${table})`) as { name: string }[]).some((c) => c.name === column);
}

function parseTimes(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

/** P1：reminders.times（JSON 数组）→ reminder_times 子表，满足 1NF */
export const migration001: Migration = {
  id: '001_reminder_times',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS reminder_times (
        reminderId TEXT NOT NULL,
        time TEXT NOT NULL,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (reminderId, time),
        FOREIGN KEY (reminderId) REFERENCES reminders (id) ON DELETE CASCADE,
        CHECK (time GLOB '[0-2][0-9]:[0-5][0-9]')
      )
    `);

    if (!hasColumn(db, 'reminders', 'times')) return;

    const rows = db
      .prepare("SELECT id, times FROM reminders WHERE times IS NOT NULL AND times <> ''")
      .all() as { id: string; times: string }[];
    const insert = db.prepare(
      'INSERT OR IGNORE INTO reminder_times (reminderId, time, sortOrder) VALUES (?, ?, ?)',
    );
    let skipped = 0;
    for (const row of rows) {
      const times = parseTimes(row.times);
      const seen = new Set<string>();
      let order = 0;
      for (const time of times) {
        if (!TIME_RE.test(time)) {
          skipped += 1;
          continue;
        }
        if (seen.has(time)) continue;
        seen.add(time);
        insert.run(row.id, time, order);
        order += 1;
      }
    }
    if (skipped) {
      console.warn(`[Cuckoo][migrate] reminder_times 回填时丢弃 ${skipped} 个非法时间值`);
    }
  },
};
