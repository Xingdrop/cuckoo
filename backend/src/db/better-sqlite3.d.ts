/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvZGIvYmV0dGVyLXNxbGl0ZTMuZC50c3wyMDI2LTExfDFjNjQ1NzQ4NDA= */
/**
 * 项目只使用 better-sqlite3 的少量同步 API；官方类型包未安装，
 * 这里声明最小可用类型，避免为迁移器新增运行/开发依赖。
 */
declare module 'better-sqlite3' {
  namespace Database {
    interface Statement<Row = unknown> {
      all(...params: unknown[]): Row[];
      get(...params: unknown[]): Row | undefined;
      run(...params: unknown[]): unknown;
    }

    interface Database {
      pragma(source: string, options?: Record<string, unknown>): any;
      prepare<Row = unknown>(source: string): Statement<Row>;
      exec(source: string): Database;
      close(): void;
      backup(destination: string, options?: Record<string, unknown>): Promise<unknown>;
    }
  }

  interface DatabaseConstructor {
    new (filename: string, options?: Record<string, unknown>): Database.Database;
    (filename: string, options?: Record<string, unknown>): Database.Database;
  }

  const Database: DatabaseConstructor;
  export = Database;
}
