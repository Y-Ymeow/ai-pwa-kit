/**
 * Storage Manager
 * 统一管理多种存储后端
 */

import type {
  IStorage,
  StorageType,
  StorageManagerConfig,
  StorageEntry,
  StorageValue,
  StorageQueryOptions,
  StorageStats,
  StorageEvent,
  StorageEventListener,
} from './types';
import { OPFSStorage } from './opfs';
import { LocalStorage } from './local';
import { MemoryStorage } from './memory';

export class StorageManager {
  private storages: Map<StorageType, IStorage> = new Map();
  private defaultType: StorageType;
  private eventListeners: StorageEventListener[] = [];
  private enableEvents: boolean;

  constructor(config: StorageManagerConfig = {}) {
    this.defaultType = config.defaultStorage || 'localStorage';
    this.enableEvents = config.enableEvents ?? false;

    // 初始化配置的存储
    const storageConfigs = config.storages || {} as Record<string, any>;

    // OPFS
    if (!storageConfigs.opfs || storageConfigs.opfs.name !== false) {
      this.register(new OPFSStorage(
        storageConfigs.opfs?.name || 'app-storage',
        storageConfigs.opfs
      ));
    }

    // LocalStorage
    if (!storageConfigs.localStorage || storageConfigs.localStorage.name !== false) {
      this.register(new LocalStorage(
        storageConfigs.localStorage?.name || 'app-storage',
        storageConfigs.localStorage
      ));
    }

    // Memory
    if (!storageConfigs.memory || storageConfigs.memory.name !== false) {
      this.register(new MemoryStorage(
        storageConfigs.memory?.name || 'app-storage',
        storageConfigs.memory
      ));
    }
  }

  /**
   * 注册存储
   */
  register(storage: IStorage): void {
    this.storages.set(storage.type, storage);
  }

  /**
   * 获取存储实例
   */
  getStorage(type?: StorageType): IStorage {
    const storageType = type || this.defaultType;
    const storage = this.storages.get(storageType);
    
    if (!storage) {
      throw new Error(`Storage type '${storageType}' not found. Did you forget to register it?`);
    }
    
    return storage;
  }

  /**
   * 获取默认存储
   */
  getDefault(): IStorage {
    return this.getStorage(this.defaultType);
  }

  /**
   * 设置默认存储类型
   */
  setDefault(type: StorageType): void {
    if (!this.storages.has(type)) {
      throw new Error(`Cannot set default: storage type '${type}' not registered`);
    }
    this.defaultType = type;
  }

  /**
   * 初始化所有存储
   */
  async initAll(): Promise<void> {
    const promises = Array.from(this.storages.values()).map(s => s.init());
    await Promise.all(promises);
  }

  /**
   * 初始化指定存储
   */
  async init(type?: StorageType): Promise<void> {
    const storage = this.getStorage(type);
    await storage.init();
  }

  /**
   * 触发事件
   */
  private emit(event: StorageEvent): void {
    if (!this.enableEvents) return;
    
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Storage event listener error:', error);
      }
    }
  }

  /**
   * 添加事件监听器
   */
  onEvent(listener: StorageEventListener): () => void {
    this.eventListeners.push(listener);
    
    // 返回取消订阅函数
    return () => {
      const index = this.eventListeners.indexOf(listener);
      if (index > -1) {
        this.eventListeners.splice(index, 1);
      }
    };
  }

  /**
   * 移除事件监听器
   */
  offEvent(listener: StorageEventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  // ==================== 便捷方法（使用默认存储）====================

  /**
   * 获取值
   */
  async get<T extends StorageValue = StorageValue>(key: string, type?: StorageType): Promise<StorageEntry<T> | null> {
    const storage = this.getStorage(type);
    const result = await storage.get<T>(key);
    
    if (result) {
      this.emit({
        type: 'set',
        key,
        storageType: storage.type,
        timestamp: Date.now(),
      });
    }
    
    return result;
  }

  /**
   * 获取值（仅返回值，不包含元数据）
   */
  async getValue<T extends StorageValue = StorageValue>(key: string, type?: StorageType): Promise<T | null> {
    const entry = await this.get<T>(key, type);
    return entry?.value ?? null;
  }

  /**
   * 设置值
   */
  async set<T extends StorageValue = StorageValue>(
    key: string,
    value: T,
    ttl?: number,
    metadata?: Record<string, unknown>,
    type?: StorageType
  ): Promise<void> {
    const storage = this.getStorage(type);
    await storage.set(key, value, ttl, metadata);
    
    this.emit({
      type: 'set',
      key,
      storageType: storage.type,
      timestamp: Date.now(),
    });
  }

  /**
   * 删除值
   */
  async delete(key: string, type?: StorageType): Promise<boolean> {
    const storage = this.getStorage(type);
    const result = await storage.delete(key);
    
    if (result) {
      this.emit({
        type: 'delete',
        key,
        storageType: storage.type,
        timestamp: Date.now(),
      });
    }
    
    return result;
  }

  /**
   * 检查键是否存在
   */
  async has(key: string, type?: StorageType): Promise<boolean> {
    const storage = this.getStorage(type);
    return storage.has(key);
  }

  /**
   * 获取所有键
   */
  async keys(type?: StorageType): Promise<string[]> {
    const storage = this.getStorage(type);
    return storage.keys();
  }

  /**
   * 获取所有条目
   */
  async getAll<T extends StorageValue = StorageValue>(options?: StorageQueryOptions, type?: StorageType): Promise<StorageEntry<T>[]> {
    const storage = this.getStorage(type);
    return storage.getAll<T>(options);
  }

  /**
   * 清空存储
   */
  async clear(type?: StorageType): Promise<void> {
    const storage = this.getStorage(type);
    await storage.clear();
    
    this.emit({
      type: 'clear',
      storageType: storage.type,
      timestamp: Date.now(),
    });
  }

  /**
   * 清空所有存储
   */
  async clearAll(): Promise<void> {
    const promises = Array.from(this.storages.values()).map(s => s.clear());
    await Promise.all(promises);
    
    this.emit({
      type: 'clear',
      storageType: 'memory', // 使用一个默认值
      timestamp: Date.now(),
    });
  }

  /**
   * 清理过期条目
   */
  async cleanup(type?: StorageType): Promise<number> {
    const storage = this.getStorage(type);
    const count = await storage.cleanup();
    
    if (count > 0) {
      this.emit({
        type: 'expire',
        storageType: storage.type,
        timestamp: Date.now(),
      });
    }
    
    return count;
  }

  /**
   * 清理所有存储的过期条目
   */
  async cleanupAll(): Promise<Record<StorageType, number>> {
    const results: Record<StorageType, number> = {} as Record<StorageType, number>;
    
    for (const [type, storage] of this.storages.entries()) {
      results[type] = await storage.cleanup();
    }
    
    return results;
  }

  /**
   * 获取存储统计
   */
  async getStats(type?: StorageType): Promise<StorageStats> {
    const storage = this.getStorage(type);
    return storage.getStats();
  }

  /**
   * 获取所有存储的统计
   */
  async getAllStats(): Promise<Record<StorageType, StorageStats>> {
    const results: Partial<Record<StorageType, StorageStats>> = {};
    
    for (const [type, storage] of this.storages.entries()) {
      results[type] = await storage.getStats();
    }
    
    return results as Record<StorageType, StorageStats>;
  }

  /**
   * 导出数据
   */
  async export(type?: StorageType): Promise<string> {
    const storage = this.getStorage(type);
    return storage.export();
  }

  /**
   * 导入数据
   */
  async import(data: string, type?: StorageType): Promise<void> {
    const storage = this.getStorage(type);
    await storage.import(data);
  }

  /**
   * 在存储之间迁移数据
   */
  async migrate(fromType: StorageType, toType: StorageType): Promise<number> {
    const fromStorage = this.getStorage(fromType);
    const toStorage = this.getStorage(toType);

    const data = await fromStorage.export();
    await toStorage.import(data);

    const entries = await toStorage.getAll();
    return entries.length;
  }

  /**
   * 检查存储是否可用
   */
  isAvailable(type: StorageType): boolean {
    return this.storages.has(type);
  }

  /**
   * 获取所有已注册的存储类型
   */
  getAvailableTypes(): StorageType[] {
    return Array.from(this.storages.keys());
  }
}

/**
 * 创建 StorageManager 的工厂函数
 */
export function createStorageManager(config?: StorageManagerConfig): StorageManager {
  return new StorageManager(config);
}

/**
 * 全局单例实例
 */
let globalStorageManager: StorageManager | null = null;

/**
 * 获取全局 StorageManager 实例
 */
export function getGlobalStorageManager(config?: StorageManagerConfig): StorageManager {
  if (!globalStorageManager) {
    globalStorageManager = new StorageManager(config);
  }
  return globalStorageManager;
}

/**
 * 设置全局 StorageManager 实例
 */
export function setGlobalStorageManager(manager: StorageManager): void {
  globalStorageManager = manager;
}
