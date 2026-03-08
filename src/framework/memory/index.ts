/**
 * Memory Module
 * 记忆系统主入口
 * 提供模糊匹配、OPFS 存储的记忆管理功能
 */

import type {
  MemoryConfig,
  MemoryEntry,
  MemoryQueryOptions,
  MemoryQueryResult,
} from './types';
import { MemoryStorage } from './storage';
import {
  fuzzyMatch,
  quickSearch,
  extractKeywords,
} from './matcher';

export { MemoryStorage } from './storage';
export {
  fuzzyMatch,
  quickSearch,
  extractKeywords,
  editDistance,
  similarity,
} from './matcher';
export type {
  MemoryConfig,
  MemoryEntry,
  MemoryQueryOptions,
  MemoryQueryResult,
  TokenizeResult,
  StorageConfig,
} from './types';

/**
 * 记忆系统
 * 整合存储和匹配功能
 */
export class Memory {
  private storage: MemoryStorage;
  private config: Required<MemoryConfig>;
  private initialized = false;

  constructor(config: MemoryConfig = {}) {
    this.config = {
      storage: {
        directory: config.storage?.directory || 'ai-memory',
        maxEntries: config.storage?.maxEntries || 1000,
        autoCleanup: config.storage?.autoCleanup ?? true,
        expireTime: config.storage?.expireTime || 30 * 24 * 60 * 60 * 1000,
      },
      tokenizer: {
        minTokenLength: config.tokenizer?.minTokenLength || 2,
        stopWords: config.tokenizer?.stopWords || [],
      },
      matcher: {
        defaultThreshold: config.matcher?.defaultThreshold || 0.3,
        useEditDistance: config.matcher?.useEditDistance ?? true,
        keywordWeight: config.matcher?.keywordWeight || 0.6,
        contentWeight: config.matcher?.contentWeight || 0.4,
      },
    };

    this.storage = new MemoryStorage(this.config.storage);
  }

  /**
   * 初始化记忆系统
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    await this.storage.init();

    // 自动清理过期数据
    if (this.config.storage.autoCleanup) {
      await this.storage.cleanup();
    }

    this.initialized = true;
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Memory not initialized. Call init() first.');
    }
  }

  /**
   * 添加记忆
   */
  async add(content: string, options: {
    tags?: string[];
    metadata?: Record<string, unknown>;
    id?: string;
  } = {}): Promise<MemoryEntry> {
    this.ensureInitialized();

    const keywords = extractKeywords(content, this.config.tokenizer.minTokenLength);

    const entry: MemoryEntry = {
      id: options.id || this.generateId(),
      content,
      keywords,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0,
      tags: options.tags,
      metadata: options.metadata,
    };

    await this.storage.save(entry);
    return entry;
  }

  /**
   * 更新记忆
   */
  async update(
    id: string,
    updates: Partial<Omit<MemoryEntry, 'id' | 'createdAt'>>
  ): Promise<MemoryEntry | null> {
    this.ensureInitialized();

    const entry = await this.storage.get(id);
    if (!entry) return null;

    // 如果内容更新了，重新提取关键词
    if (updates.content && updates.content !== entry.content) {
      updates.keywords = extractKeywords(updates.content, this.config.tokenizer.minTokenLength);
    }

    const updated: MemoryEntry = {
      ...entry,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.storage.save(updated);
    return updated;
  }

  /**
   * 获取记忆
   */
  async get(id: string): Promise<MemoryEntry | null> {
    this.ensureInitialized();

    const entry = await this.storage.get(id);
    if (entry) {
      // 更新访问统计
      entry.accessCount++;
      entry.lastAccessedAt = Date.now();
      await this.storage.save(entry);
    }

    return entry;
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<boolean> {
    this.ensureInitialized();
    return this.storage.delete(id);
  }

  /**
   * 搜索记忆（模糊匹配）
   */
  async search(query: string, options: MemoryQueryOptions = {}): Promise<MemoryQueryResult[]> {
    this.ensureInitialized();

    const entries = await this.storage.getAll();

    return fuzzyMatch(query, entries, {
      threshold: options.threshold ?? this.config.matcher.defaultThreshold,
      limit: options.limit,
      sortBy: options.sortBy,
      tags: options.tags,
      timeRange: options.timeRange,
    });
  }

  /**
   * 快速搜索（仅关键词匹配）
   */
  async quickSearch(query: string, limit: number = 10): Promise<MemoryEntry[]> {
    this.ensureInitialized();

    const entries = await this.storage.getAll();
    return quickSearch(query, entries, limit);
  }

  /**
   * 根据关键词查找
   */
  async findByKeywords(keywords: string[]): Promise<MemoryEntry[]> {
    this.ensureInitialized();
    return this.storage.queryByKeywords(keywords);
  }

  /**
   * 根据标签查找
   */
  async findByTags(tags: string[]): Promise<MemoryEntry[]> {
    this.ensureInitialized();
    return this.storage.queryByTags(tags);
  }

  /**
   * 获取所有记忆
   */
  async getAll(): Promise<MemoryEntry[]> {
    this.ensureInitialized();
    return this.storage.getAll();
  }

  /**
   * 清理过期记忆
   */
  async cleanup(): Promise<number> {
    this.ensureInitialized();
    return this.storage.cleanup();
  }

  /**
   * 清空所有记忆
   */
  async clear(): Promise<void> {
    this.ensureInitialized();
    return this.storage.clear();
  }

  /**
   * 导出数据
   */
  async export(): Promise<string> {
    this.ensureInitialized();
    return this.storage.export();
  }

  /**
   * 导入数据
   */
  async import(data: string): Promise<void> {
    this.ensureInitialized();
    return this.storage.import(data);
  }

  /**
   * 获取统计信息
   */
  async getStats(): ReturnType<MemoryStorage['getStats']> {
    this.ensureInitialized();
    return this.storage.getStats();
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 创建记忆系统实例（便捷函数）
 */
export function createMemory(config?: MemoryConfig): Memory {
  return new Memory(config);
}
