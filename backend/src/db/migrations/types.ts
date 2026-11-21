/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvZGIvbWlncmF0aW9ucy90eXBlcy50c3wyMDI2LTExfDFhMGYwZTFiNmY= */
import type Database from 'better-sqlite3';

export interface Migration {
  /** 唯一 id，按字典序执行 */
  id: string;
  up(db: Database.Database): void;
}
