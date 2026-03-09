/**
 * LocalStorage
 * 使用浏览器 localStorage 的存储实现
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

export class LocalStorage implements IStorage {
  readonly type: StorageType = 'localStorage';
  readonly name: string;
  
  private config: Required<StorageConfig>;
  private prefix: string;
  private initialized = false;

  constructor(name: string = 'app-storage', config: StorageConfig = {}) {
    this.name = name;
    this.prefix = `${name}:`;
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

    // 检查 localStorage 是否可用
    try {
      const testKey = `${this.prefix}__test__`;
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      this.initialized = true;
    } catch (error) {
      throw new Error(`LocalStorage is not available: ${error}`);
    }
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
   * 获取完整键名（加前缀）
   */
  private getFullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * 从完整键名提取原始键名
   */
  private getKeyFromFullKey(fullKey: string): string | null {
    if (!fullKey.startsWith(this.prefix)) return null;
    return fullKey.slice(this.prefix.length);
  }

  /**
   * 序列化数据
   */
  private serialize(data: unknown): string {
    const serialized = this.config.serializer.stringify(data);
    if (this.config.encryption) {
      return this.config.encryption.encrypt(serialized);
    }
    return serialized;
  }

  /**
   * 反序列化数据
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

    try {
      const fullKey = this.getFullKey(key);
      const data = localStorage.getItem(fullKey);
      
      if (data === null) {
        return null;
      }

      const entry = this.deserialize<StorageEntry<StorageValue>>(data);

      // 检查是否过期
      if (this.isExpired(entry)) {
        localStorage.removeItem(fullKey);
        return null;
      }

      return entry as StorageEntry<T>;
    } catch (error) {
      throw new Error(`Failed to get entry: ${error}`);
    }
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

    try {
      const entry: StorageEntry<T> = {
        key,
        value,
        createdAt: Date.now(),
        expiresAt: ttl && ttl > 0 ? Date.now() + ttl : undefined,
        metadata,
      };

      const fullKey = this.getFullKey(key);
      const serialized = this.serialize(entry);
      
      // 检查大小限制（localStorage 通常限制 5-10MB）
      try {
        localStorage.setItem(fullKey, serialized);
      } catch (e) {
        if ((e as Error).name === 'QuotaExceededError') {
          throw new Error('Storage quota exceeded. Try clearing some data.');
        }
        throw e;
      }
    } catch (error) {
      throw new Error(`Failed to set entry: ${error}`);
    }
  }

  /**
   * 删除值
   */
  async delete(key: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const fullKey = this.getFullKey(key);
      const exists = localStorage.getItem(fullKey) !== null;
      
      if (exists) {
        localStorage.removeItem(fullKey);
        return true;
      }
      
      return false;
    } catch (error) {
      throw new Error(`Failed to delete entry: ${error}`);
    }
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

    const keys: string[] = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (fullKey && fullKey.startsWith(this.prefix)) {
          const key = this.getKeyFromFullKey(fullKey);
          if (key) {
            // 检查是否过期
            const entry = await this.get(key);
            if (entry) {
              keys.push(key);
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to list keys: ${error}`);
    }

    return keys;
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

    try {
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (fullKey && fullKey.startsWith(this.prefix)) {
          keysToRemove.push(fullKey);
        }
      }

      for (const fullKey of keysToRemove) {
        localStorage.removeItem(fullKey);
      }
    } catch (error) {
      throw new Error(`Failed to clear storage: ${error}`);
    }
  }

  /**
   * 清理过期条目
   */
  async cleanup(): Promise<number> {
    this.ensureInitialized();

    let deletedCount = 0;

    try {
      const keysToCheck: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (fullKey && fullKey.startsWith(this.prefix)) {
          keysToCheck.push(fullKey);
        }
      }

      for (const fullKey of keysToCheck) {
        try {
          const data = localStorage.getItem(fullKey);
          if (data) {
            const entry = this.deserialize<StorageEntry>(data);
            if (this.isExpired(entry)) {
              localStorage.removeItem(fullKey);
              deletedCount++;
            }
          }
        } catch {
          // 跳过损坏的条目
          continue;
        }
      }
    } catch (error) {
      throw new Error(`Failed to cleanup storage: ${error}`);
    }

    return deletedCount;
  }

  /**
   * 获取存储统计
   */
  async getStats(): Promise<StorageStats> {
    let totalSize = 0;
    let expiredEntries = 0;
    const entries = await this.getAll();

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
}
