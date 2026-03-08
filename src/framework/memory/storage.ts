/**
 * Memory Storage Module
 * 使用 OPFS (Origin Private File System) 存储记忆数据
 */

import type { MemoryEntry, StorageConfig } from './types';

export class MemoryStorage {
  private config: Required<StorageConfig>;
  private rootDir: FileSystemDirectoryHandle | null = null;
  private initialized = false;

  constructor(config: StorageConfig = {}) {
    this.config = {
      directory: config.directory || 'ai-memory',
      maxEntries: config.maxEntries || 1000,
      autoCleanup: config.autoCleanup ?? true,
      expireTime: config.expireTime || 30 * 24 * 60 * 60 * 1000, // 30天
    };
  }

  /**
   * 初始化存储
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // @ts-ignore navigator.storage may not be in all TypeScript lib versions
      const root = await navigator.storage.getDirectory();
      this.rootDir = await root.getDirectoryHandle(this.config.directory, { create: true });
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize OPFS storage: ${error}`);
    }
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Storage not initialized. Call init() first.');
    }
  }

  /**
   * 生成文件名
   */
  private getFileName(id: string): string {
    // 使用 ID 的哈希值作为文件名，避免特殊字符问题
    return `${id}.json`;
  }

  /**
   * 保存记忆条目
   */
  async save(entry: MemoryEntry): Promise<void> {
    this.ensureInitialized();

    try {
      const fileName = this.getFileName(entry.id);
      const fileHandle = await this.rootDir!.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(entry, null, 2));
      await writable.close();
    } catch (error) {
      throw new Error(`Failed to save memory entry: ${error}`);
    }
  }

  /**
   * 获取记忆条目
   */
  async get(id: string): Promise<MemoryEntry | null> {
    this.ensureInitialized();

    try {
      const fileName = this.getFileName(id);
      const fileHandle = await this.rootDir!.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const content = await file.text();
      return JSON.parse(content) as MemoryEntry;
    } catch (error) {
      // 文件不存在返回 null
      if ((error as Error).name === 'NotFoundError') {
        return null;
      }
      throw new Error(`Failed to get memory entry: ${error}`);
    }
  }

  /**
   * 删除记忆条目
   */
  async delete(id: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const fileName = this.getFileName(id);
      await this.rootDir!.removeEntry(fileName);
      return true;
    } catch (error) {
      if ((error as Error).name === 'NotFoundError') {
        return false;
      }
      throw new Error(`Failed to delete memory entry: ${error}`);
    }
  }

  /**
   * 获取所有记忆条目
   */
  async getAll(): Promise<MemoryEntry[]> {
    this.ensureInitialized();

    const entries: MemoryEntry[] = [];

    try {
      // @ts-ignore FileSystemDirectoryHandle.entries() might not be in all TypeScript versions
      for await (const [name, handle] of this.rootDir!.entries()) {
        if (handle.kind === 'file' && name.endsWith('.json')) {
          try {
            const file = await (handle as FileSystemFileHandle).getFile();
            const content = await file.text();
            entries.push(JSON.parse(content) as MemoryEntry);
          } catch {
            // 跳过损坏的文件
            continue;
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to list memory entries: ${error}`);
    }

    return entries;
  }

  /**
   * 根据关键词查询
   */
  async queryByKeywords(keywords: string[]): Promise<MemoryEntry[]> {
    const allEntries = await this.getAll();
    return allEntries.filter((entry) =>
      keywords.some((kw) =>
        entry.keywords.some((ek) =>
          ek.toLowerCase().includes(kw.toLowerCase()) ||
          kw.toLowerCase().includes(ek.toLowerCase())
        )
      )
    );
  }

  /**
   * 根据标签查询
   */
  async queryByTags(tags: string[]): Promise<MemoryEntry[]> {
    const allEntries = await this.getAll();
    return allEntries.filter((entry) =>
      tags.some((tag) => entry.tags?.includes(tag))
    );
  }

  /**
   * 清理过期条目
   */
  async cleanup(): Promise<number> {
    if (!this.config.autoCleanup) return 0;

    const allEntries = await this.getAll();
    const now = Date.now();
    let deletedCount = 0;

    for (const entry of allEntries) {
      const isExpired = this.config.expireTime > 0 &&
        (now - entry.updatedAt) > this.config.expireTime;

      if (isExpired) {
        await this.delete(entry.id);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    this.ensureInitialized();

    try {
      // 删除整个目录后重新创建
      // @ts-ignore navigator.storage may not be in all TypeScript lib versions
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(this.config.directory, { recursive: true });
      this.rootDir = await root.getDirectoryHandle(this.config.directory, { create: true });
    } catch (error) {
      throw new Error(`Failed to clear storage: ${error}`);
    }
  }

  /**
   * 获取存储统计信息
   */
  async getStats(): Promise<{
    totalEntries: number;
    totalSize: number;
    oldestEntry?: number;
    newestEntry?: number;
  }> {
    const entries = await this.getAll();
    let totalSize = 0;
    let oldestEntry: number | undefined;
    let newestEntry: number | undefined;

    for (const entry of entries) {
      const size = JSON.stringify(entry).length;
      totalSize += size;

      if (!oldestEntry || entry.createdAt < oldestEntry) {
        oldestEntry = entry.createdAt;
      }
      if (!newestEntry || entry.createdAt > newestEntry) {
        newestEntry = entry.createdAt;
      }
    }

    return {
      totalEntries: entries.length,
      totalSize,
      oldestEntry,
      newestEntry,
    };
  }

  /**
   * 导出所有数据为 JSON 字符串
   */
  async export(): Promise<string> {
    const entries = await this.getAll();
    return JSON.stringify(entries, null, 2);
  }

  /**
   * 导入数据
   */
  async import(data: string): Promise<void> {
    try {
      const entries = JSON.parse(data) as MemoryEntry[];
      for (const entry of entries) {
        await this.save(entry);
      }
    } catch (error) {
      throw new Error(`Failed to import memory data: ${error}`);
    }
  }
}