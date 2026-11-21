/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvZGIvbWlncmF0aW9ucy9pbmRleC50c3wyMDI2LTExfDhkNzE5OTk0ZDY= */
import { migration001 } from './001_reminder_times';
import { migration002 } from './002_array_tables';
import { migration003 } from './003_foreign_keys';
import { migration004 } from './004_unique_soft_delete';
import { migration005 } from './005_indexes';
import { migration006 } from './006_cleanup_columns';
import { migration007 } from './007_recount_posts';
import type { Migration } from './types';

export type { Migration };

/** 静态注册，避免运行期扫描目录（编译后 dist 无需拷贝资源） */
export const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
];
