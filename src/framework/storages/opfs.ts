/**
 * OPFS Storage
 * 使用 Origin Private File System 的存储实现
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

export class OPFSStorage implements IStorage {
  readonly type: StorageType = 'opfs';
  readonly name: string;
  
  private config: Required<StorageConfig>;
  private rootDir: FileSystemDirectoryHandle | null = null;
  private initialized = false;

  constructor(name: string = 'app-storage', config: StorageConfig = {}) {
    this.name = name;
    this.config = {
      name,
      defaultTTL: config.defaultTTL ?? 0, // 0 表示不过期
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

    try {
      // @ts-ignore navigator.storage may not be in all TypeScript lib versions
      const root = await navigator.storage.getDirectory();
      this.rootDir = await root.getDirectoryHandle(this.name, { create: true });
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize OPFS storage: ${error}`);
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
   * 生成文件名（处理特殊字符）
   */
  private getFileName(key: string): string {
    // 使用 base64 编码键名，避免特殊字符问题
    const encoded = btoa(encodeURIComponent(key));
    return `${encoded}.json`;
  }

  /**
   * 从文件名解码键名
   */
  private getKeyFromFileName(fileName: string): string | null {
    if (!fileName.endsWith('.json')) return null;
    try {
      const encoded = fileName.slice(0, -5); // 移除 .json
      return decodeURIComponent(atob(encoded));
    } catch {
      return null;
    }
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
      const fileName = this.getFileName(key);
      const fileHandle = await this.rootDir!.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const content = await file.text();
      const entry = this.deserialize<StorageEntry<T>>(content);

      // 检查是否过期
      if (this.isExpired(entry)) {
        await this.delete(key);
        return null;
      }

      return entry;
    } catch (error) {
      if ((error as Error).name === 'NotFoundError') {
        return null;
      }
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

      const fileName = this.getFileName(key);
      const fileHandle = await this.rootDir!.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(this.serialize(entry));
      await writable.close();
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
      const fileName = this.getFileName(key);
      await this.rootDir!.removeEntry(fileName);
      return true;
    } catch (error) {
      if ((error as Error).name === 'NotFoundError') {
        return false;
      }
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
      // @ts-ignore FileSystemDirectoryHandle.entries() might not be in all TypeScript versions
      for await (const [name, handle] of this.rootDir!.entries()) {
        if (handle.kind === 'file' && name.endsWith('.json')) {
          const key = this.getKeyFromFileName(name);
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
      // @ts-ignore navigator.storage may not be in all TypeScript lib versions
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(this.name, { recursive: true });
      this.rootDir = await root.getDirectoryHandle(this.name, { create: true });
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
      // @ts-ignore FileSystemDirectoryHandle.entries() might not be in all TypeScript versions
      for await (const [name, handle] of this.rootDir!.entries()) {
        if (handle.kind === 'file' && name.endsWith('.json')) {
          try {
            const file = await (handle as FileSystemFileHandle).getFile();
            const content = await file.text();
            const entry = this.deserialize<StorageEntry>(content);

            if (this.isExpired(entry)) {
              const key = this.getKeyFromFileName(name);
              if (key) {
                await this.delete(key);
                deletedCount++;
              }
            }
          } catch {
            // 跳过损坏的文件
            continue;
          }
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
      totalSize += JSON.stringify(entry).length * 2; // 近似 UTF-16 大小
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
