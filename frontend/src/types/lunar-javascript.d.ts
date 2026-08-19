/** lunar-javascript 最小类型声明（仅本项目用到的 API） */
declare module 'lunar-javascript' {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    static fromDate(date: Date): Solar;
    getLunar(): Lunar;
    /** 公历节日列表 */
    getFestivals(): string[];
    getYear(): number;
    getMonth(): number;
    getDay(): number;
  }

  export class Lunar {
    /** 农历字符串，如"二〇二六年七月七日" */
    toString(): string;
    /** 农历节日列表 */
    getFestivals(): string[];
  }
}
