import type { ValueTransformer } from 'typeorm';

/**
 * UTC datetime 列转换器。
 *
 * 背景：better-sqlite3 将 Date 存为 "YYYY-MM-DD HH:mm:ss.SSS"（UTC 时刻、无时区标记），
 * TypeORM 读取后返回字符串；JS `new Date("无Z串")` 会按本地时区解析导致偏移。
 * 本转换器在读取时补 'Z' 还原为真正的 UTC 时刻。
 */
export const utcDateTime: ValueTransformer = {
  // undefined 必须原样返回：CreateDateColumn/UpdateDateColumn 依赖 undefined 触发自动赋值
  to: (value: Date | string | null | undefined) =>
    value === undefined ? undefined : (value ?? null),
  from: (value: string | Date | null): Date | null => {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string' && !value.includes('Z') && !value.includes('+')) {
      return new Date(value + 'Z');
    }
    return new Date(value);
  },
};
