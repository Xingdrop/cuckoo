/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvZGIvbWlncmF0aW9ucy8wMDdfcmVjb3VudF9wb3N0cy50c3wyMDI2LTExfDNiZmRkZGQ1MTU= */
import type Database from 'better-sqlite3';
import type { Migration } from './types';

/**
 * P8：反规范化计数以 interactions 为准重算，修复历史漂移。
 * 运行时递减统一改为 MAX(0, x-1)（见 PlansService）。
 */
export const migration007: Migration = {
  id: '007_recount_posts',
  up(db) {
    const exists = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'posts'")
      .get();
    if (!exists) return;
    db.exec(`
      UPDATE posts SET
        "likesCount" = (
          SELECT COUNT(*) FROM interactions
          WHERE interactions."postId" = posts."id" AND interactions."type" = 'like'
        ),
        "commentsCount" = (
          SELECT COUNT(*) FROM interactions
          WHERE interactions."postId" = posts."id" AND interactions."type" = 'comment'
        ),
        "joinedCount" = (
          SELECT COUNT(*) FROM interactions
          WHERE interactions."postId" = posts."id" AND interactions."type" = 'join'
        )
    `);
  },
};
