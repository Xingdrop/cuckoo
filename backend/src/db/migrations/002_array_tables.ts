/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvZGIvbWlncmF0aW9ucy8wMDJfYXJyYXlfdGFibGVzLnRzfDIwMjYtMTF8ODExZTU5MDMyZQ== */
import type Database from 'better-sqlite3';
import type { Migration } from './types';

function hasTable(db: Database.Database, table: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
  );
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  if (!hasTable(db, table)) return false;
  return (db.pragma(`table_info(${table})`) as { name: string }[]).some((c) => c.name === column);
}

function parseArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string' && v.length > 0)
      : [];
  } catch {
    return [];
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** P2：healthGoals / 药品照片 / 微运动组图 → 子表 */
export const migration002: Migration = {
  id: '002_array_tables',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_health_goals (
        userId TEXT NOT NULL,
        goal TEXT NOT NULL,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (userId, goal),
        FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS medicine_photos (
        medicineId TEXT NOT NULL,
        sortOrder INTEGER NOT NULL,
        url TEXT NOT NULL,
        PRIMARY KEY (medicineId, sortOrder),
        FOREIGN KEY (medicineId) REFERENCES medicines (id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS exercise_images (
        exerciseId TEXT NOT NULL,
        sortOrder INTEGER NOT NULL,
        url TEXT NOT NULL,
        PRIMARY KEY (exerciseId, sortOrder),
        FOREIGN KEY (exerciseId) REFERENCES exercises (id) ON DELETE CASCADE
      );
    `);

    if (hasColumn(db, 'users', 'healthGoals')) {
      const rows = db
        .prepare("SELECT id, healthGoals FROM users WHERE healthGoals IS NOT NULL AND healthGoals <> ''")
        .all() as { id: string; healthGoals: string }[];
      const insert = db.prepare(
        'INSERT OR IGNORE INTO user_health_goals (userId, goal, sortOrder) VALUES (?, ?, ?)',
      );
      for (const row of rows) {
        unique(parseArray(row.healthGoals)).forEach((goal, sortOrder) =>
          insert.run(row.id, goal, sortOrder),
        );
      }
    }

    if (hasTable(db, 'medicines') && hasColumn(db, 'medicines', 'photoUrls')) {
      const rows = db
        .prepare('SELECT id, photoUrl, photoUrls FROM medicines')
        .all() as { id: string; photoUrl: string | null; photoUrls: string | null }[];
      const insert = db.prepare(
        'INSERT OR IGNORE INTO medicine_photos (medicineId, sortOrder, url) VALUES (?, ?, ?)',
      );
      for (const row of rows) {
        const urls = unique(parseArray(row.photoUrls));
        const all = urls.length ? urls : row.photoUrl ? [row.photoUrl] : [];
        all.forEach((url, sortOrder) => insert.run(row.id, sortOrder, url));
      }
    }

    if (hasColumn(db, 'exercises', 'imageUrls')) {
      const rows = db
        .prepare("SELECT id, imageUrls FROM exercises WHERE imageUrls IS NOT NULL AND imageUrls <> ''")
        .all() as { id: string; imageUrls: string }[];
      const insert = db.prepare(
        'INSERT OR IGNORE INTO exercise_images (exerciseId, sortOrder, url) VALUES (?, ?, ?)',
      );
      for (const row of rows) {
        unique(parseArray(row.imageUrls)).forEach((url, sortOrder) =>
          insert.run(row.id, sortOrder, url),
        );
      }
    }
  },
};
