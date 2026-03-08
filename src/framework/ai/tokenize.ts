/**
 * Tokenize Module
 * Token 计数和文本处理工具
 * 
 * 注意：此模块提供简单的字符估算方法。
 * 如需精确计数，建议集成 tiktoken 或调用 OpenAI 的 tokenizer API
 */

/**
 * Token 计数选项
 */
export interface TokenizeOptions {
  /** 是否保留标点符号 */
  keepPunctuation?: boolean;
  /** 是否保留空白字符 */
  keepWhitespace?: boolean;
  /** 是否转换为小写 */
  lowercase?: boolean;
  /** 最小 Token 长度 */
  minLength?: number;
}

/**
 * Token 计数结果
 */
export interface TokenCountResult {
  /** Token 数量（估算） */
  count: number;
  /** Token 列表 */
  tokens: string[];
  /** 原始文本 */
  original: string;
  /** 字符数 */
  charCount: number;
  /** 字节数 */
  byteCount: number;
}

/**
 * 简单分词（基于空格和标点）
 */
export function tokenize(text: string, options: TokenizeOptions = {}): TokenCountResult {
  const {
    keepPunctuation = false,
    keepWhitespace = false,
    lowercase = true,
    minLength = 1,
  } = options;

  // 处理文本
  let processed = text;
  
  if (lowercase) {
    processed = processed.toLowerCase();
  }

  if (!keepPunctuation) {
    // 移除标点，但保留中文字符之间的分隔
    processed = processed.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ');
  }

  if (!keepWhitespace) {
    processed = processed.replace(/\s+/g, ' ').trim();
  }

  // 分词
  const tokens: string[] = [];
  
  // 中文按字分词
  const chineseRegex = /[\u4e00-\u9fa5]/g;
  const chineseChars = processed.match(chineseRegex) || [];
  tokens.push(...chineseChars);
  
  // 英文/数字按词分
  const nonChineseParts = processed.split(chineseRegex);
  for (const part of nonChineseParts) {
    if (part.trim()) {
      const words = part.trim().split(/\s+/);
      for (const word of words) {
        if (word.length >= minLength) {
          tokens.push(word);
        }
      }
    }
  }

  // 估算 token 数量
  // 中文：约 1 字 = 1 token
  // 英文：约 4 字符 = 1 token（平均值）
  let estimatedCount = 0;
  for (const token of tokens) {
    if (/[\u4e00-\u9fa5]/.test(token)) {
      estimatedCount += 1; // 中文字符
    } else {
      estimatedCount += Math.ceil(token.length / 4); // 英文按每4字符1token估算
    }
  }

  return {
    count: estimatedCount,
    tokens,
    original: text,
    charCount: text.length,
    byteCount: new Blob([text]).size,
  };
}

/**
 * 快速估算 Token 数量（不返回详细列表）
 * 
 * 估算规则：
 * - 中文字符：1 字 ≈ 1 token
 * - 英文单词：1 词 ≈ 1.3 tokens
 * - 代码/特殊字符：需要更多 tokens
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;

  // 统计中文字符
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  
  // 统计英文单词（简单按空格分割）
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  
  // 统计数字
  const numbers = (text.match(/\d+/g) || []).length;
  
  // 统计标点符号
  const punctuations = (text.match(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g) || []).length;
  
  // 估算：
  // 中文：1 字 = 1 token
  // 英文：1 词 ≈ 1.3 tokens
  // 数字：1 个 = 0.5 token
  // 标点：1 个 = 0.5 token
  const estimate = chineseChars 
    + englishWords * 1.3 
    + numbers * 0.5 
    + punctuations * 0.5;

  return Math.ceil(estimate);
}

/**
 * 更精确的 Token 估算（基于 GPT 系列模型的经验公式）
 * 
 * 对于 GPT-3/4 模型：
 * - 英文：约 0.75 词 / token，或约 4 字符 / token
 * - 中文：约 1 字 / token
 * - 代码：token 数会更多
 */
export function estimateGPTTokens(text: string): number {
  if (!text) return 0;

  // 去除多余空白
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  // 中文字符数
  const chineseCount = (cleanText.match(/[\u4e00-\u9fa5]/g) || []).length;
  
  // 非中文字符数
  const nonChineseCount = cleanText.length - chineseCount;
  
  // 估算：
  // 中文：1:1
  // 其他：每4个字符1个token
  const estimate = chineseCount + Math.ceil(nonChineseCount / 4);
  
  return estimate;
}

/**
 * 截断文本到指定 Token 数
 */
export function truncateToTokenCount(text: string, maxTokens: number): string {
  if (estimateTokenCount(text) <= maxTokens) {
    return text;
  }

  // 二分查找截断点
  let left = 0;
  let right = text.length;
  let result = text;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const truncated = text.slice(0, mid);
    const count = estimateTokenCount(truncated);

    if (count <= maxTokens) {
      result = truncated;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
}

/**
 * 分割长文本为多个块（基于 Token 数）
 */
export function splitToChunks(text: string, maxTokensPerChunk: number): string[] {
  if (estimateTokenCount(text) <= maxTokensPerChunk) {
    return [text];
  }

  const chunks: string[] = [];
  const sentences = text.split(/([。！？.!?\n]+)/);
  
  let currentChunk = '';
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    
    if (estimateTokenCount(currentChunk + sentence) > maxTokensPerChunk) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        // 单个句子就超过限制，需要强制截断
        chunks.push(truncateToTokenCount(sentence, maxTokensPerChunk));
      }
    } else {
      currentChunk += sentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * 计算多段文本的总 Token 数
 */
export function countTotalTokens(texts: string[]): {
  total: number;
  breakdown: number[];
} {
  const breakdown = texts.map((text) => estimateTokenCount(text));
  const total = breakdown.reduce((sum, count) => sum + count, 0);
  
  return { total, breakdown };
}

/**
 * 格式化 Token 数为可读字符串
 */
export function formatTokenCount(count: number): string {
  if (count < 1000) {
    return count.toString();
  }
  if (count < 1000000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return `${(count / 1000000).toFixed(2)}M`;
}

/**
 * Token 预算管理器
 * 用于管理对话中的 Token 预算
 */
export class TokenBudget {
  private maxTokens: number;
  private usedTokens: number = 0;
  private reservedTokens: number = 0;

  constructor(maxTokens: number, reservedTokens: number = 500) {
    this.maxTokens = maxTokens;
    this.reservedTokens = reservedTokens;
  }

  /**
   * 获取剩余可用 Token 数
   */
  getRemaining(): number {
    return this.maxTokens - this.usedTokens - this.reservedTokens;
  }

  /**
   * 检查是否还有足够预算
   */
  canAfford(tokens: number): boolean {
    return this.getRemaining() >= tokens;
  }

  /**
   * 使用 Token
   */
  use(tokens: number): boolean {
    if (!this.canAfford(tokens)) {
      return false;
    }
    this.usedTokens += tokens;
    return true;
  }

  /**
   * 释放 Token
   */
  release(tokens: number): void {
    this.usedTokens = Math.max(0, this.usedTokens - tokens);
  }

  /**
   * 重置预算
   */
  reset(): void {
    this.usedTokens = 0;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    maxTokens: number;
    usedTokens: number;
    reservedTokens: number;
    remainingTokens: number;
  } {
    return {
      maxTokens: this.maxTokens,
      usedTokens: this.usedTokens,
      reservedTokens: this.reservedTokens,
      remainingTokens: this.getRemaining(),
    };
  }
}

/**
 * 文本编码器（简单实现）
 * 如需精确编码，建议使用 tiktoken
 */
export class TextEncoder {
  /**
   * 编码文本为 token 数组（简化版）
   */
  encode(text: string): number[] {
    // 简化实现：将每个字符转为 charCode
    // 实际应该使用 BPE 等算法
    return text.split('').map((char) => char.charCodeAt(0));
  }

  /**
   * 解码 token 数组为文本
   */
  decode(tokens: number[]): string {
    return tokens.map((code) => String.fromCharCode(code)).join('');
  }

  /**
   * 获取 Token 数量
   */
  count(text: string): number {
    return estimateTokenCount(text);
  }
}