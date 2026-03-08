/**
 * Storages Module
 * 通用存储模块 - 支持 OPFS、LocalStorage 和内存存储
 * 
 * @example
 * ```typescript
 * import { StorageManager, OPFSStorage, LocalStorage } from './storages';
 * 
 * // 方式1: 使用管理器
 * const manager = new StorageManager({
 *   defaultStorage: 'localStorage'
 * });
 * await manager.init();
 * 
 * await manager.set('user', { name: '张三', age: 25 });
 * const user = await manager.getValue('user');
 * 
 * // 方式2: 直接使用具体存储
 * const storage = new LocalStorage('my-app');
 * await storage.init();
 * await storage.set('key', 'value', 3600000); // 1小时后过期
 * ```
 */

// 类型导出
export type {
  IStorage,
  StorageType,
  StorageValue,
  StorageEntry,
  StorageConfig,
  StorageQueryOptions,
  StorageStats,
  StorageEvent,
  StorageEventType,
  StorageEventListener,
  StorageManagerConfig,
} from './types';

// 具体实现
export { OPFSStorage } from './opfs';
export { LocalStorage } from './local';
export { MemoryStorage } from './memory';

// 管理器
export {
  StorageManager,
  createStorageManager,
  getGlobalStorageManager,
  setGlobalStorageManager,
} from './manager';

// 压缩
export {
  Compression,
  createCompression,
  compressText,
  decompressText,
  compressObject,
  decompressObject,
  type CompressionOptions,
  type CompressionResult,
} from './compression';
