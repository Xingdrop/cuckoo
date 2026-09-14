/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvY29tbW9uL3NlbnNpdGl2ZS13b3Jkcy5zcGVjLnRzfDIwMjYtMDl8MjgzNWViNWQ4ZQ== */ */
import { filterSensitiveWords } from './sensitive-words';

describe('敏感词过滤（UT-COMMON-03）', () => {
  const WORDS = ['代购处方药', '偏方根治', '百分百治愈', '祖传秘方'];

  it('命中单个词 → 替换为 **', () => {
    expect(filterSensitiveWords('本店出售代购处方药，价格优惠', WORDS)).toBe('本店出售**，价格优惠');
  });

  it('命中多个词 → 全部替换；长词优先', () => {
    expect(filterSensitiveWords('代购处方药+偏方根治，百分百治愈！', WORDS)).toBe('**+**，**！');
  });

  it('无命中 → 原文本返回', () => {
    const text = '记得按时喝水，保持好心情～';
    expect(filterSensitiveWords(text, WORDS)).toBe(text);
  });

  it('空文本/空词库 → 原样返回', () => {
    expect(filterSensitiveWords('', WORDS)).toBe('');
    expect(filterSensitiveWords('任意文本', [])).toBe('任意文本');
  });

  it('英文词汇大小写不敏感', () => {
    expect(filterSensitiveWords('Buy Fake MEDS now', ['fake meds'])).toBe('Buy ** now');
  });

  it('词库去重且无空词干扰', () => {
    const dup = ['偏方根治', '偏方根治', '', '偏方根治'];
    expect(filterSensitiveWords('偏方根治来了', dup)).toBe('**来了');
  });
});
