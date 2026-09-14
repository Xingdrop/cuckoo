/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvY29tbW9uL3NlbnNpdGl2ZS13b3Jkcy50c3wyMDI2LTA5fDhmMzY1YWI3Nzg= */ */
/**
 * 敏感词过滤纯函数（FR-607 内容治理）。
 * 纯函数便于单测（UT-COMMON-03）；词库由 SocialService 从 SensitiveWord 表加载。
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 将文本中命中的敏感词替换为 `**`。
 * - 长词优先（避免子串先被替换破坏整词匹配）
 * - 大小写不敏感（兼容英文词汇）
 * - 空文本/空词库直接返回原文本
 */
export function filterSensitiveWords(text: string, words: readonly string[]): string {
  if (!text || words.length === 0) return text;
  const sorted = [...new Set(words)].filter(Boolean).sort((a, b) => b.length - a.length);
  let result = text;
  for (const word of sorted) {
    result = result.replace(new RegExp(escapeRegExp(word), 'gi'), '**');
  }
  return result;
}
