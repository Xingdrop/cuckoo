/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvZGIvbWlncmF0ZS1jbGkudHN8MjAyNi0xMXw4ZjI2ZjZiNzgx */
import { config as loadEnv } from 'dotenv';
import { runMigrations } from './migrator';

loadEnv();

runMigrations()
  .then((result) => {
    console.log(
      `[Cuckoo][migrate] 完成：应用 ${result.applied.length} 个迁移` +
        (result.backup ? `，备份 ${result.backup}` : ''),
    );
  })
  .catch((error) => {
    console.error('[Cuckoo][migrate] 失败：', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
