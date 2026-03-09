/**
 * Memory Storage
 * 内存存储实现（非持久化）
 */

import type {
  IStorage,
  StorageType,
  StorageConfig,
  StorageEntry,
  StorageValue,
  StorageQueryOptions,
  StorageStats,
} from './types';
import { defaultEncryption } from './types';

export class MemoryStorage implements IStorage {
  readonly type: StorageType = 'memory';
  readonly name: string;
  
  private config: Required<StorageConfig>;
  private store: Map<string, StorageEntry> = new Map();
  private initialized = false;

  constructor(name: string = 'app-storage', config: StorageConfig = {}) {
    this.name = name;
    this.config = {
      name,
      defaultTTL: config.defaultTTL ?? 0,
      serializer: config.serializer ?? {
        stringify: JSON.stringify,
        parse: JSON.parse,
      },
      encryption: config.encryption ?? defaultEncryption,
    };
  }

  /**
   * 初始化存储
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
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
   * 序列化数据（用于加密）
   */
  private serialize(data: unknown): string {
    const serialized = this.config.serializer.stringify(data);
    if (this.config.encryption) {
      return this.config.encryption.encrypt(serialized);
    }
    return serialized;
  }

  /**
   * 反序列化数据（用于解密）
   */
  private deserialize<T>(data: string): T {
    let decrypted = data;
    if (this.config.encryption) {
      decrypted = this.config.encryption.decrypt(data);
    }
    return this.config.serializer.parse(decrypted) as T;
  }

  /**
   * 检查条目是否过期
   */
  private isExpired(entry: StorageEntry): boolean {
    if (!entry.expiresAt) return false;
    return Date.now() > entry.expiresAt;
  }

  /**
   * 获取值
   */
  async get<T extends StorageValue = StorageValue>(key: string): Promise<StorageEntry<T> | null> {
    this.ensureInitialized();

    const entry = this.store.get(key);
    
    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }

    // 如果使用了加密，需要深拷贝并解密值
    if (this.config.encryption) {
      const serialized = this.serialize(entry);
      return this.deserialize<StorageEntry<T>>(serialized);
    }

    return entry as StorageEntry<T>;
  }

  /**
   * 设置值
   */
  async set<T extends StorageValue = StorageValue>(
    key: string,
    value: T,
    ttl?: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.ensureInitialized();

    const entry: StorageEntry<T> = {
      key,
      value,
      createdAt: Date.now(),
      expiresAt: ttl && ttl > 0 ? Date.now() + ttl : undefined,
      metadata,
    };

    // 如果使用了加密，序列化后再解析以确保深拷贝
    if (this.config.encryption) {
      const serialized = this.serialize(entry);
      this.store.set(key, this.deserialize<StorageEntry>(serialized));
    } else {
      this.store.set(key, entry as StorageEntry);
    }
  }

  /**
   * 删除值
   */
  async delete(key: string): Promise<boolean> {
    this.ensureInitialized();
    return this.store.delete(key);
  }

  /**
   * 检查键是否存在
   */
  async has(key: string): Promise<boolean> {
    const entry = await this.get(key);
    return entry !== null;
  }

  /**
   * 获取所有键
   */
  async keys(): Promise<string[]> {
    this.ensureInitialized();
    
    // 清理过期键
    const validKeys: string[] = [];
    for (const key of this.store.keys()) {
      const entry = this.store.get(key);
      if (entry && !this.isExpired(entry)) {
        validKeys.push(key);
      } else {
        this.store.delete(key);
      }
    }
    
    return validKeys;
  }

  /**
   * 获取所有条目
   */
  async getAll<T extends StorageValue = StorageValue>(options: StorageQueryOptions = {}): Promise<StorageEntry<T>[]> {
    const keys = await this.keys();
    const entries: StorageEntry<T>[] = [];

    for (const key of keys) {
      // 前缀匹配
      if (options.prefix && !key.startsWith(options.prefix)) {
        continue;
      }

      const entry = await this.get<T>(key);
      if (entry) {
        entries.push(entry);
      }

      // 限制数量
      if (options.limit && entries.length >= options.limit) {
        break;
      }
    }

    return entries;
  }

  /**
   * 清空存储
   */
  async clear(): Promise<void> {
    this.ensureInitialized();
    this.store.clear();
  }

  /**
   * 清理过期条目
   */
  async cleanup(): Promise<number> {
    this.ensureInitialized();

    let deletedCount = 0;

    for (const [key, entry] of this.store.entries()) {
      if (this.isExpired(entry)) {
        this.store.delete(key);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * 获取存储统计
   */
  async getStats(): Promise<StorageStats> {
    const entries = Array.from(this.store.values());
    let totalSize = 0;
    let expiredEntries = 0;

    for (const entry of entries) {
      totalSize += JSON.stringify(entry).length * 2;
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        expiredEntries++;
      }
    }

    return {
      totalEntries: entries.length,
      totalSize,
      expiredEntries,
    };
  }

  /**
   * 导出所有数据
   */
  async export(): Promise<string> {
    const entries = await this.getAll();
    return this.config.serializer.stringify(entries);
  }

  /**
   * 导入数据
   */
  async import(data: string): Promise<void> {
    try {
      const entries = this.config.serializer.parse(data) as StorageEntry[];
      for (const entry of entries) {
        await this.set(entry.key, entry.value,
          entry.expiresAt ? entry.expiresAt - Date.now() : undefined,
          entry.metadata
        );
      }
    } catch (error) {
      throw new Error(`Failed to import data: ${error}`);
    }
  }

  /**
   * 获取原始存储（用于调试）
   */
  getRawStore(): Map<string, StorageEntry> {
    return this.store;
  }

  /**
   * 获取条目数量
   */
  get size(): number {
    return this.store.size;
  }
}
