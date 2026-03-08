/**
 * Memory Types
 * 记忆系统的类型定义
 */

/**
 * 记忆条目
 */
export interface MemoryEntry {
  /** 唯一标识 */
  id: string;
  /** 记忆内容 */
  content: string;
  /** 关键词（用于快速检索） */
  keywords: string[];
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 访问次数 */
  accessCount: number;
  /** 最后访问时间 */
  lastAccessedAt?: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
  /** 分类标签 */
  tags?: string[];
}

/**
 * 记忆查询选项
 */
export interface MemoryQueryOptions {
  /** 关键词 */
  keywords?: string[];
  /** 标签筛选 */
  tags?: string[];
  /** 模糊匹配阈值 (0-1) */
  threshold?: number;
  /** 最大返回数量 */
  limit?: number;
  /** 排序方式 */
  sortBy?: 'relevance' | 'time' | 'access';
  /** 时间范围筛选 */
  timeRange?: {
    start?: number;
    end?: number;
  };
}

/**
 * 记忆查询结果
 */
export interface MemoryQueryResult {
  /** 匹配的记忆条目 */
  entry: MemoryEntry;
  /** 匹配分数 (0-1) */
  score: number;
  /** 匹配的关键词 */
  matchedKeywords: string[];
}

/**
 * 分词结果
 */
export interface TokenizeResult {
  /** 分词后的词元列表 */
  tokens: string[];
  /** 原始文本 */
  original: string;
  /** Token 数量 */
  count: number;
}

/**
 * 存储配置
 */
export interface StorageConfig {
  /** 存储目录名 */
  directory?: string;
  /** 最大存储条目数 */
  maxEntries?: number;
  /** 自动清理过期条目 */
  autoCleanup?: boolean;
  /** 过期时间（毫秒） */
  expireTime?: number;
}

/**
 * 记忆系统配置
 */
export interface MemoryConfig {
  /** 存储配置 */
  storage?: StorageConfig;
  /** 分词配置 */
  tokenizer?: {
    /** 最小词长度 */
    minTokenLength?: number;
    /** 停用词列表 */
    stopWords?: string[];
  };
  /** 匹配配置 */
  matcher?: {
    /** 默认匹配阈值 */
    defaultThreshold?: number;
    /** 使用编辑距离 */
    useEditDistance?: boolean;
    /** 权重：关键词匹配 */
    keywordWeight?: number;
    /** 权重：内容相似度 */
    contentWeight?: number;
  };
}
