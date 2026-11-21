/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvZGIvbWlncmF0aW9ucy8wMDNfZm9yZWlnbl9rZXlzLnRzfDIwMjYtMTF8NThlMDc3OGMzNA== */
import type Database from 'better-sqlite3';
import type { Migration } from './types';

function hasTable(db: Database.Database, table: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
  );
}

/** SQLite 12-step 表重建：建新表 → 复制数据 → 删旧表 → 改名 */
function rebuild(
  db: Database.Database,
  table: string,
  createSql: (tmp: string) => string,
  columns: string,
  selectColumns: string = columns,
): void {
  if (!hasTable(db, table)) return;
  const tmp = `${table}__new`;
  db.exec(`DROP TABLE IF EXISTS "${tmp}"`);
  db.exec(createSql(tmp));
  db.exec(`INSERT INTO "${tmp}" (${columns}) SELECT ${selectColumns} FROM "${table}"`);
  db.exec(`DROP TABLE "${table}"`);
  db.exec(`ALTER TABLE "${tmp}" RENAME TO "${table}"`);
}

/**
 * P3 + P4：为历史表补外键，并统一加状态枚举 / 非负 / 布尔 CHECK。
 * 外键索引由 005 迁移统一创建。
 */
export const migration003: Migration = {
  id: '003_foreign_keys',
  up(db) {
    // 历史遗留：2 条通知流水指向已硬删除的临时账号，FK 无法成立 → 清理并留日志
    const orphanLogs = hasTable(db, 'notification_logs')
      ? (
          db
            .prepare(
              'SELECT COUNT(*) c FROM notification_logs WHERE userId NOT IN (SELECT id FROM users)',
            )
            .get() as { c: number }
        ).c
      : 0;
    if (orphanLogs > 0) {
      db.exec(
        'DELETE FROM notification_logs WHERE userId NOT IN (SELECT id FROM users)',
      );
      console.warn(`[Cuckoo][migrate] 清理了 ${orphanLogs} 条无主通知流水（原用户已不存在）`);
    }

    rebuild(
      db,
      'users',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "username" varchar NOT NULL,
          "phone" varchar,
          "passwordHash" varchar NOT NULL,
          "avatarUrl" varchar,
          "healthGoals" text,
          "timezone" varchar NOT NULL DEFAULT 'Asia/Shanghai',
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
          "deletedAt" datetime
        )
      `,
      '"id", "username", "phone", "passwordHash", "avatarUrl", "healthGoals", "timezone", "createdAt", "updatedAt", "deletedAt"',
    );

    rebuild(
      db,
      'plans',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "userId" text NOT NULL,
          "name" varchar NOT NULL,
          "description" varchar NOT NULL DEFAULT '',
          "sourceType" varchar NOT NULL DEFAULT 'self',
          "sourceTitle" varchar,
          "sourceId" varchar,
          "isActive" boolean NOT NULL DEFAULT 1,
          "config" text,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY ("userId") REFERENCES users ("id") ON DELETE CASCADE,
          CHECK ("sourceType" IN ('self', 'official', 'share')),
          CHECK ("isActive" IN (0, 1))
        )
      `,
      '"id", "userId", "name", "description", "sourceType", "sourceTitle", "sourceId", "isActive", "config", "createdAt"',
    );

    rebuild(
      db,
      'notifications',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "userId" text NOT NULL,
          "type" text NOT NULL,
          "title" varchar NOT NULL,
          "content" text NOT NULL,
          "linkUrl" varchar,
          "isRead" boolean NOT NULL DEFAULT 0,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY ("userId") REFERENCES users ("id") ON DELETE CASCADE,
          CHECK ("isRead" IN (0, 1))
        )
      `,
      '"id", "userId", "type", "title", "content", "linkUrl", "isRead", "createdAt"',
    );

    rebuild(
      db,
      'notification_logs',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "notificationId" text,
          "userId" text NOT NULL,
          "recipientType" varchar NOT NULL DEFAULT 'user',
          "recipient" varchar,
          "channel" text NOT NULL,
          "dedupKey" varchar,
          "status" text NOT NULL DEFAULT 'sent',
          "sentAt" datetime NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY ("userId") REFERENCES users ("id") ON DELETE CASCADE,
          FOREIGN KEY ("notificationId") REFERENCES notifications ("id") ON DELETE SET NULL,
          CHECK ("channel" IN ('push', 'inapp')),
          CHECK ("status" IN ('sent', 'failed'))
        )
      `,
      '"id", "notificationId", "userId", "recipientType", "recipient", "channel", "dedupKey", "status", "sentAt"',
    );

    rebuild(
      db,
      'devices',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "userId" text NOT NULL,
          "endpoint" varchar NOT NULL,
          "keysAuth" varchar NOT NULL,
          "keysP256dh" varchar NOT NULL,
          "userAgent" varchar,
          "lastSeenAt" datetime,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
          UNIQUE ("endpoint"),
          FOREIGN KEY ("userId") REFERENCES users ("id") ON DELETE CASCADE
        )
      `,
      '"id", "userId", "endpoint", "keysAuth", "keysP256dh", "userAgent", "lastSeenAt", "createdAt", "updatedAt"',
    );

    rebuild(
      db,
      'follows',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "followerId" text NOT NULL,
          "followingId" text NOT NULL,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          UNIQUE ("followerId", "followingId"),
          FOREIGN KEY ("followerId") REFERENCES users ("id") ON DELETE CASCADE,
          FOREIGN KEY ("followingId") REFERENCES users ("id") ON DELETE CASCADE,
          CHECK ("followerId" <> "followingId")
        )
      `,
      '"id", "followerId", "followingId", "createdAt"',
    );

    rebuild(
      db,
      'achievements',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "userId" text NOT NULL,
          "type" varchar NOT NULL,
          "achievedAt" datetime NOT NULL DEFAULT (datetime('now')),
          UNIQUE ("userId", "type"),
          FOREIGN KEY ("userId") REFERENCES users ("id") ON DELETE CASCADE
        )
      `,
      '"id", "userId", "type", "achievedAt"',
    );

    rebuild(
      db,
      'interactions',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "postId" text NOT NULL,
          "userId" text NOT NULL,
          "type" text NOT NULL,
          "content" varchar,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          UNIQUE ("postId", "userId", "type"),
          FOREIGN KEY ("postId") REFERENCES posts ("id") ON DELETE CASCADE,
          FOREIGN KEY ("userId") REFERENCES users ("id") ON DELETE CASCADE,
          CHECK ("type" IN ('like', 'comment', 'favorite', 'join'))
        )
      `,
      '"id", "postId", "userId", "type", "content", "createdAt"',
    );

    rebuild(
      db,
      'reports',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "userId" text NOT NULL,
          "type" text NOT NULL,
          "period" varchar NOT NULL,
          "data" text NOT NULL,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          UNIQUE ("userId", "type", "period"),
          FOREIGN KEY ("userId") REFERENCES users ("id") ON DELETE CASCADE,
          CHECK ("type" IN ('weekly', 'monthly'))
        )
      `,
      '"id", "userId", "type", "period", "data", "createdAt"',
    );

    rebuild(
      db,
      'emergency_contacts',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "userId" text NOT NULL,
          "name" varchar NOT NULL,
          "phone" varchar,
          "appUserId" text,
          "relation" varchar,
          "receiveLowStock" boolean NOT NULL DEFAULT 1,
          "receiveMissed" boolean NOT NULL DEFAULT 1,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY ("userId") REFERENCES users ("id") ON DELETE CASCADE,
          FOREIGN KEY ("appUserId") REFERENCES users ("id") ON DELETE SET NULL,
          CHECK ("receiveLowStock" IN (0, 1)),
          CHECK ("receiveMissed" IN (0, 1))
        )
      `,
      '"id", "userId", "name", "phone", "appUserId", "relation", "receiveLowStock", "receiveMissed", "createdAt"',
    );

    rebuild(
      db,
      'family_bindings',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "userAId" text NOT NULL,
          "userBId" text NOT NULL,
          "status" varchar NOT NULL DEFAULT 'pending',
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
          UNIQUE ("userAId", "userBId"),
          FOREIGN KEY ("userAId") REFERENCES users ("id") ON DELETE CASCADE,
          FOREIGN KEY ("userBId") REFERENCES users ("id") ON DELETE CASCADE,
          CHECK ("status" IN ('pending', 'active')),
          CHECK ("userAId" <> "userBId")
        )
      `,
      '"id", "userAId", "userBId", "status", "createdAt", "updatedAt"',
    );

    rebuild(
      db,
      'family_chat_messages',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "bindingId" text NOT NULL,
          "senderId" text NOT NULL,
          "content" varchar,
          "photoUrl" varchar,
          "readAt" datetime,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY ("bindingId") REFERENCES family_bindings ("id") ON DELETE CASCADE,
          FOREIGN KEY ("senderId") REFERENCES users ("id") ON DELETE CASCADE,
          CHECK (
            ("content" IS NOT NULL AND "content" <> '') OR
            ("photoUrl" IS NOT NULL AND "photoUrl" <> '')
          )
        )
      `,
      '"id", "bindingId", "senderId", "content", "photoUrl", "readAt", "createdAt"',
    );

    rebuild(
      db,
      'medicines',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "userId" text NOT NULL,
          "name" varchar NOT NULL,
          "dosage" varchar,
          "administration" varchar,
          "stock" integer NOT NULL DEFAULT 0,
          "threshold" integer NOT NULL DEFAULT 0,
          "expiryDate" date,
          "instructions" varchar,
          "photoUrl" varchar,
          "photoUrls" text,
          "deductionPerUse" integer NOT NULL DEFAULT 1,
          "notifyOnLowStock" boolean NOT NULL DEFAULT 1,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
          "deletedAt" datetime,
          FOREIGN KEY ("userId") REFERENCES users ("id") ON DELETE CASCADE,
          CHECK ("stock" >= 0),
          CHECK ("threshold" >= 0),
          CHECK ("deductionPerUse" >= 0),
          CHECK ("notifyOnLowStock" IN (0, 1))
        )
      `,
      '"id", "userId", "name", "dosage", "administration", "stock", "threshold", "expiryDate", "instructions", "photoUrl", "photoUrls", "deductionPerUse", "notifyOnLowStock", "createdAt", "updatedAt", "deletedAt"',
    );

    rebuild(
      db,
      'posts',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "userId" text NOT NULL,
          "type" text NOT NULL,
          "content" text NOT NULL,
          "mediaUrls" text NOT NULL DEFAULT '[]',
          "planSnapshot" text,
          "planVersion" integer NOT NULL DEFAULT 1,
          "likesCount" integer NOT NULL DEFAULT 0,
          "commentsCount" integer NOT NULL DEFAULT 0,
          "joinedCount" integer NOT NULL DEFAULT 0,
          "status" text NOT NULL DEFAULT 'published',
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
          "deletedAt" datetime,
          FOREIGN KEY ("userId") REFERENCES users ("id") ON DELETE CASCADE,
          CHECK ("type" IN ('user_plan', 'official_plan', 'achievement', 'report')),
          CHECK ("status" IN ('published', 'pending_review', 'blocked')),
          CHECK ("likesCount" >= 0),
          CHECK ("commentsCount" >= 0),
          CHECK ("joinedCount" >= 0)
        )
      `,
      '"id", "userId", "type", "content", "mediaUrls", "planSnapshot", "planVersion", "likesCount", "commentsCount", "joinedCount", "status", "createdAt", "updatedAt", "deletedAt"',
    );

    rebuild(
      db,
      'reminders',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "userId" text NOT NULL,
          "category" text NOT NULL,
          "categoryLabel" varchar,
          "categoryIcon" varchar,
          "title" varchar NOT NULL,
          "repeatRule" text NOT NULL,
          "startDate" datetime NOT NULL,
          "times" text,
          "endDate" datetime,
          "nextTriggerAt" datetime,
          "content" text NOT NULL DEFAULT '{}',
          "method" text NOT NULL DEFAULT '{}',
          "delaySettings" text NOT NULL DEFAULT '{}',
          "challenge" text NOT NULL DEFAULT '{}',
          "medicineId" text,
          "planId" text,
          "modifiedFromPlan" boolean NOT NULL DEFAULT 0,
          "countInRate" boolean NOT NULL DEFAULT 1,
          "isActive" boolean NOT NULL DEFAULT 1,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
          "deletedAt" datetime,
          FOREIGN KEY ("userId") REFERENCES users ("id") ON DELETE CASCADE,
          FOREIGN KEY ("medicineId") REFERENCES medicines ("id") ON DELETE SET NULL,
          FOREIGN KEY ("planId") REFERENCES plans ("id") ON DELETE SET NULL,
          CHECK ("category" IN ('medication', 'exercise', 'water', 'rest', 'work', 'custom')),
          CHECK ("modifiedFromPlan" IN (0, 1)),
          CHECK ("countInRate" IN (0, 1)),
          CHECK ("isActive" IN (0, 1))
        )
      `,
      '"id", "userId", "category", "categoryLabel", "categoryIcon", "title", "repeatRule", "startDate", "times", "endDate", "nextTriggerAt", "content", "method", "delaySettings", "challenge", "medicineId", "planId", "modifiedFromPlan", "countInRate", "isActive", "createdAt", "updatedAt", "deletedAt"',
    );

    rebuild(
      db,
      'reminder_logs',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "reminderId" text,
          "userId" text NOT NULL,
          "scheduledTime" datetime NOT NULL,
          "actualTime" datetime,
          "status" text NOT NULL,
          "delayMinutes" integer NOT NULL DEFAULT 0,
          "photoUrl" varchar,
          "medicineId" text,
          "stockDeducted" integer NOT NULL DEFAULT 0,
          "medicineNameSnapshot" varchar,
          "category" varchar,
          "amount" integer NOT NULL DEFAULT 0,
          "note" text,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          UNIQUE ("reminderId", "scheduledTime"),
          FOREIGN KEY ("reminderId") REFERENCES reminders ("id") ON DELETE CASCADE,
          FOREIGN KEY ("medicineId") REFERENCES medicines ("id") ON DELETE SET NULL,
          CHECK ("delayMinutes" >= 0),
          CHECK ("stockDeducted" >= 0),
          CHECK ("amount" >= 0)
        )
      `,
      '"id", "reminderId", "userId", "scheduledTime", "actualTime", "status", "delayMinutes", "photoUrl", "medicineId", "stockDeducted", "medicineNameSnapshot", "category", "amount", "note", "createdAt"',
    );

    // 历史列名 reminderId 实际存的是 planId（见 SocialService.joinPlan）
    rebuild(
      db,
      'plan_join_records',
      (t) => `
        CREATE TABLE "${t}" (
          "id" text PRIMARY KEY NOT NULL,
          "postId" text NOT NULL,
          "userId" text NOT NULL,
          "planId" text NOT NULL,
          "isActive" boolean NOT NULL DEFAULT 1,
          "joinedAt" datetime NOT NULL DEFAULT (datetime('now')),
          UNIQUE ("postId", "userId"),
          FOREIGN KEY ("postId") REFERENCES posts ("id") ON DELETE CASCADE,
          FOREIGN KEY ("userId") REFERENCES users ("id") ON DELETE CASCADE,
          FOREIGN KEY ("planId") REFERENCES plans ("id") ON DELETE CASCADE,
          CHECK ("isActive" IN (0, 1))
        )
      `,
      '"id", "postId", "userId", "planId", "isActive", "joinedAt"',
      '"id", "postId", "userId", "reminderId", "isActive", "joinedAt"',
    );

    rebuild(
      db,
      'user_settings',
      (t) => `
        CREATE TABLE "${t}" (
          "userId" text PRIMARY KEY NOT NULL,
          "notificationEnabled" boolean NOT NULL DEFAULT 1,
          "soundEnabled" boolean NOT NULL DEFAULT 1,
          "vibrationEnabled" boolean NOT NULL DEFAULT 1,
          "theme" varchar NOT NULL DEFAULT 'default',
          "missedThresholdMinutes" integer NOT NULL DEFAULT 30,
          "showSkipButton" boolean NOT NULL DEFAULT 0,
          "maxDelayCount" integer NOT NULL DEFAULT 3,
          "waterGoalMl" integer NOT NULL DEFAULT 2000,
          "waterInRate" boolean NOT NULL DEFAULT 0,
          "waterCountInRate" boolean NOT NULL DEFAULT 0,
          FOREIGN KEY ("userId") REFERENCES users ("id") ON DELETE CASCADE,
          CHECK ("notificationEnabled" IN (0, 1)),
          CHECK ("soundEnabled" IN (0, 1)),
          CHECK ("vibrationEnabled" IN (0, 1)),
          CHECK ("showSkipButton" IN (0, 1)),
          CHECK ("waterInRate" IN (0, 1)),
          CHECK ("waterCountInRate" IN (0, 1)),
          CHECK ("missedThresholdMinutes" >= 0),
          CHECK ("maxDelayCount" >= 0),
          CHECK ("waterGoalMl" >= 0)
        )
      `,
      '"userId", "notificationEnabled", "soundEnabled", "vibrationEnabled", "theme", "missedThresholdMinutes", "showSkipButton", "maxDelayCount", "waterGoalMl", "waterInRate", "waterCountInRate"',
    );
  },
};
