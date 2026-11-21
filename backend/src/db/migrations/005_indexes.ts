/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvZGIvbWlncmF0aW9ucy8wMDVfaW5kZXhlcy50c3wyMDI2LTExfGQwMjViNjQyYTU= */
import type Database from 'better-sqlite3';
import type { Migration } from './types';

function hasTable(db: Database.Database, table: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
  );
}

/**
 * P6：外键列与高频查询列补索引。
 * 表重建（003）会丢弃原有索引，这里统一重建；IF NOT EXISTS 保证幂等。
 */
export const migration005: Migration = {
  id: '005_indexes',
  up(db) {
    const indexes: [table: string, name: string, columns: string][] = [
      ['users', 'idx_users_createdAt', '"createdAt"'],
      ['plans', 'idx_plans_userId', '"userId"'],
      ['posts', 'idx_posts_userId', '"userId"'],
      ['posts', 'idx_posts_status_createdAt', '"status", "createdAt"'],
      ['notifications', 'idx_notifications_userId', '"userId"'],
      ['notifications', 'idx_notifications_user_read', '"userId", "isRead"'],
      ['notifications', 'idx_notifications_user_created', '"userId", "createdAt"'],
      ['notification_logs', 'idx_notification_logs_userId', '"userId"'],
      ['notification_logs', 'idx_notification_logs_notificationId', '"notificationId"'],
      ['notification_logs', 'idx_notification_logs_dedupKey', '"dedupKey"'],
      ['devices', 'idx_devices_userId', '"userId"'],
      ['reminders', 'idx_reminders_userId', '"userId"'],
      ['reminders', 'idx_reminders_user_active', '"userId", "isActive"'],
      ['reminders', 'idx_reminders_nextTriggerAt', '"nextTriggerAt"'],
      ['reminders', 'idx_reminders_planId', '"planId"'],
      ['reminders', 'idx_reminders_medicineId', '"medicineId"'],
      ['reminder_logs', 'idx_reminder_logs_userId', '"userId"'],
      ['reminder_logs', 'idx_reminder_logs_user_scheduled', '"userId", "scheduledTime"'],
      ['reminder_logs', 'idx_reminder_logs_medicineId', '"medicineId"'],
      ['follows', 'idx_follows_followerId', '"followerId"'],
      ['follows', 'idx_follows_followingId', '"followingId"'],
      ['achievements', 'idx_achievements_userId', '"userId"'],
      ['interactions', 'idx_interactions_userId', '"userId"'],
      ['interactions', 'idx_interactions_postId', '"postId"'],
      ['reports', 'idx_reports_userId', '"userId"'],
      ['emergency_contacts', 'idx_emergency_contacts_userId', '"userId"'],
      ['emergency_contacts', 'idx_emergency_contacts_appUserId', '"appUserId"'],
      ['family_bindings', 'idx_family_bindings_userAId', '"userAId"'],
      ['family_bindings', 'idx_family_bindings_userBId', '"userBId"'],
      ['family_chat_messages', 'idx_family_chat_messages_binding_created', '"bindingId", "createdAt"'],
      ['family_chat_messages', 'idx_family_chat_messages_senderId', '"senderId"'],
      ['plan_join_records', 'idx_plan_join_records_userId', '"userId"'],
      ['plan_join_records', 'idx_plan_join_records_planId', '"planId"'],
      ['plan_join_records', 'idx_plan_join_records_postId', '"postId"'],
      ['audit_logs', 'idx_audit_logs_user_created', '"userId", "createdAt"'],
    ];
    for (const [table, name, columns] of indexes) {
      if (!hasTable(db, table)) continue;
      db.exec(`CREATE INDEX IF NOT EXISTS "${name}" ON "${table}" (${columns})`);
    }
  },
};
