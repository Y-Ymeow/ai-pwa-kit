/**
 * Memory Matcher Module
 * 模糊匹配算法：分词 + 关键词 + 编辑距离
 */

import type { MemoryEntry, MemoryQueryOptions, MemoryQueryResult, TokenizeResult } from './types';

/**
 * 中文分词（简单实现）
 * 使用正向最大匹配算法
 */
export function tokenize(text: string, minLength: number = 2): TokenizeResult {
  // 清理文本
  const cleaned = text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')  // 保留中文、英文、数字
    .replace(/\s+/g, ' ')
    .trim();

  const tokens: string[] = [];

  // 中文分词（简单按字分，实际可用更复杂的算法）
  const chars = cleaned.split('');
  let i = 0;

  while (i < chars.length) {
    const char = chars[i];

    // 如果是空格，跳过
    if (char === ' ') {
      i++;
      continue;
    }

    // 中文字符
    if (/[\u4e00-\u9fa5]/.test(char)) {
      // 尝试提取词组（2-4个字）
      let word = char;
      let j = i + 1;
      while (j < chars.length && j < i + 4 && /[\u4e00-\u9fa5]/.test(chars[j])) {
        word += chars[j];
        j++;
      }

      if (word.length >= minLength) {
        tokens.push(word);
      }
      i++;
    }
    // 英文/数字
    else if (/[a-z0-9]/.test(char)) {
      let word = char;
      let j = i + 1;
      while (j < chars.length && /[a-z0-9]/.test(chars[j])) {
        word += chars[j];
        j++;
      }

      if (word.length >= minLength) {
        tokens.push(word);
      }
      i = j;
    } else {
      i++;
    }
  }

  return {
    tokens,
    original: text,
    count: tokens.length,
  };
}

/**
 * 提取关键词
 */
export function extractKeywords(text: string, minLength: number = 2): string[] {
  const result = tokenize(text, minLength);
  // 去重
  return [...new Set(result.tokens)];
}

/**
 * 计算编辑距离（Levenshtein Distance）
 */
export function editDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // 创建 DP 表
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // 初始化边界
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // 填充 DP 表
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // 删除
          dp[i][j - 1] + 1,     // 插入
          dp[i - 1][j - 1] + 1  // 替换
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * 计算相似度（基于编辑距离）
 * 返回 0-1 之间的值，1 表示完全相同
 */
export function similarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;

  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;

  const distance = editDistance(str1, str2);
  return 1 - distance / maxLen;
}

/**
 * 计算关键词匹配分数
 */
function calculateKeywordScore(queryKeywords: string[], entryKeywords: string[]): number {
  if (queryKeywords.length === 0 || entryKeywords.length === 0) return 0;

  let matchedCount = 0;
  const matchedKeywords: string[] = [];

  for (const qk of queryKeywords) {
    for (const ek of entryKeywords) {
      // 完全匹配
      if (qk === ek) {
        matchedCount++;
        matchedKeywords.push(qk);
        break;
      }
      // 包含匹配
      if (ek.includes(qk) || qk.includes(ek)) {
        matchedCount += 0.8;
        matchedKeywords.push(qk);
        break;
      }
      // 相似度匹配（编辑距离）
      const sim = similarity(qk, ek);
      if (sim > 0.7) {
        matchedCount += sim * 0.5;
        matchedKeywords.push(qk);
        break;
      }
    }
  }

  return matchedCount / Math.max(queryKeywords.length, entryKeywords.length);
}

/**
 * 计算内容相似度分数
 */
function calculateContentScore(query: string, content: string): number {
  const queryTokens = tokenize(query).tokens;
  const contentTokens = tokenize(content).tokens;

  if (queryTokens.length === 0 || contentTokens.length === 0) return 0;

  // 计算 Jaccard 相似度
  const querySet = new Set(queryTokens);
  const contentSet = new Set(contentTokens);

  const intersection = new Set([...querySet].filter((x) => contentSet.has(x)));
  const union = new Set([...querySet, ...contentSet]);

  return intersection.size / union.size;
}

/**
 * 计算综合匹配分数
 */
function calculateScore(
  query: string,
  entry: MemoryEntry,
  options: {
    keywordWeight?: number;
    contentWeight?: number;
    useEditDistance?: boolean;
  } = {}
): { score: number; matchedKeywords: string[] } {
  const { keywordWeight = 0.6, contentWeight = 0.4, useEditDistance = true } = options;

  // 提取查询关键词
  const queryKeywords = extractKeywords(query);

  // 关键词匹配分数
  const keywordScore = calculateKeywordScore(queryKeywords, entry.keywords);

  // 内容相似度分数
  const contentScore = calculateContentScore(query, entry.content);

  // 计算匹配到的关键词
  const matchedKeywords: string[] = [];
  for (const qk of queryKeywords) {
    for (const ek of entry.keywords) {
      if (qk === ek || ek.includes(qk) || qk.includes(ek)) {
        matchedKeywords.push(qk);
        break;
      }
      if (useEditDistance && similarity(qk, ek) > 0.7) {
        matchedKeywords.push(qk);
        break;
      }
    }
  }

  // 综合分数
  const score = keywordScore * keywordWeight + contentScore * contentWeight;

  return {
    score: Math.min(score, 1),
    matchedKeywords: [...new Set(matchedKeywords)],
  };
}

/**
 * 模糊匹配记忆条目
 */
export function fuzzyMatch(
  query: string,
  entries: MemoryEntry[],
  options: MemoryQueryOptions = {}
): MemoryQueryResult[] {
  const {
    threshold = 0.3,
    limit = 10,
    sortBy = 'relevance',
    tags,
    timeRange,
  } = options;

  let results: MemoryQueryResult[] = [];

  for (const entry of entries) {
    // 标签筛选
    if (tags && tags.length > 0) {
      if (!tags.some((tag) => entry.tags?.includes(tag))) {
        continue;
      }
    }

    // 时间范围筛选
    if (timeRange) {
      if (timeRange.start && entry.createdAt < timeRange.start) continue;
      if (timeRange.end && entry.createdAt > timeRange.end) continue;
    }

    // 计算匹配分数
    const { score, matchedKeywords } = calculateScore(query, entry, {
      keywordWeight: 0.6,
      contentWeight: 0.4,
    });

    // 低于阈值跳过
    if (score < threshold) continue;

    results.push({
      entry,
      score,
      matchedKeywords,
    });
  }

  // 排序
  results.sort((a, b) => {
    switch (sortBy) {
      case 'relevance':
        return b.score - a.score;
      case 'time':
        return b.entry.createdAt - a.entry.createdAt;
      case 'access':
        return (b.entry.accessCount || 0) - (a.entry.accessCount || 0);
      default:
        return b.score - a.score;
    }
  });

  // 限制数量
  if (limit > 0 && results.length > limit) {
    results = results.slice(0, limit);
  }

  return results;
}

/**
 * 快速搜索（仅关键词匹配）
 */
export function quickSearch(
  query: string,
  entries: MemoryEntry[],
  limit: number = 10
): MemoryEntry[] {
  const queryKeywords = extractKeywords(query);

  return entries
    .filter((entry) =>
      queryKeywords.some((qk) =>
        entry.keywords.some((ek) =>
          ek.toLowerCase().includes(qk.toLowerCase()) ||
          qk.toLowerCase().includes(ek.toLowerCase())
        )
      )
    )
    .slice(0, limit);
}

/**
 * 语义相似度计算（基于词向量余弦相似度简化版）
 * 使用词频作为特征
 */
export function semanticSimilarity(text1: string, text2: string): number {
  const tokens1 = tokenize(text1).tokens;
  const tokens2 = tokenize(text2).tokens;

  // 构建词频表
  const freq1 = new Map<string, number>();
  const freq2 = new Map<string, number>();
  const allTokens = new Set<string>();

  for (const t of tokens1) {
    freq1.set(t, (freq1.get(t) || 0) + 1);
    allTokens.add(t);
  }
  for (const t of tokens2) {
    freq2.set(t, (freq2.get(t) || 0) + 1);
    allTokens.add(t);
  }

  // 计算点积
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (const t of allTokens) {
    const f1 = freq1.get(t) || 0;
    const f2 = freq2.get(t) || 0;
    dotProduct += f1 * f2;
    norm1 += f1 * f1;
    norm2 += f2 * f2;
  }

  if (norm1 === 0 || norm2 === 0) return 0;

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}
