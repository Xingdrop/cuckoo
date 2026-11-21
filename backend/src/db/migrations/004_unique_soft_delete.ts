/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvZGIvbWlncmF0aW9ucy8wMDRfdW5pcXVlX3NvZnRfZGVsZXRlLnRzfDIwMjYtMTF8YjMyYTczMTI4OA== */
import type Database from 'better-sqlite3';
import type { Migration } from './types';

function hasTable(db: Database.Database, table: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
  );
}

/**
 * P5：软删除用户允许复用用户名/手机号（部分唯一索引）；
 * 亲友绑定按无序对去重（A,B）与（B,A）视为同一关系。
 */
export const migration004: Migration = {
  id: '004_unique_soft_delete',
  up(db) {
    if (hasTable(db, 'users')) {
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS UQ_users_username_active
          ON users (username) WHERE deletedAt IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS UQ_users_phone_active
          ON users (phone) WHERE deletedAt IS NULL AND phone IS NOT NULL;
      `);
    }

    if (hasTable(db, 'family_bindings')) {
      db.exec(`
        DELETE FROM family_bindings
        WHERE rowid NOT IN (
          SELECT MIN(rowid) FROM family_bindings
          GROUP BY MIN(userAId, userBId), MAX(userAId, userBId)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ux_family_bindings_pair
          ON family_bindings (MIN(userAId, userBId), MAX(userAId, userBId));
      `);
    }
  },
};
