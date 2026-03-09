/**
 * Storage Types
 * 通用存储模块的类型定义
 */

/**
 * 存储类型
 */
export type StorageType = 'opfs' | 'localStorage' | 'memory';

/**
 * 存储值类型
 */
export type StorageValue = string | number | boolean | object | null | undefined;

/**
 * 存储条目
 */
export interface StorageEntry<T = StorageValue> {
  /** 键名 */
  key: string;
  /** 存储的值 */
  value: T;
  /** 创建时间 */
  createdAt: number;
  /** 过期时间（毫秒时间戳，可选） */
  expiresAt?: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 存储配置
 */
export interface StorageConfig {
  /** 存储名称/前缀 */
  name?: string;
  /** 默认过期时间（毫秒） */
  defaultTTL?: number;
  /** 序列化方法 */
  serializer?: {
    stringify: (value: unknown) => string;
    parse: (text: string) => unknown;
  };
  /** 加密配置（可选） */
  encryption?: {
    encrypt: (data: string) => string;
    decrypt: (data: string) => string;
  };
}

/** 默认加密实现（空操作） */
export const defaultEncryption = {
  encrypt: (data: string) => data,
  decrypt: (data: string) => data,
};

/**
 * 存储查询选项
 */
export interface StorageQueryOptions {
  /** 键名前缀匹配 */
  prefix?: string;
  /** 是否包含过期数据 */
  includeExpired?: boolean;
  /** 限制返回数量 */
  limit?: number;
}

/**
 * 存储统计信息
 */
export interface StorageStats {
  /** 总条目数 */
  totalEntries: number;
  /** 总大小（字节） */
  totalSize: number;
  /** 过期条目数 */
  expiredEntries: number;
}

/**
 * 存储接口 - 所有存储实现必须遵循
 */
export interface IStorage {
  /** 存储类型 */
  readonly type: StorageType;
  
  /** 存储名称 */
  readonly name: string;
  
  /**
   * 初始化存储
   */
  init(): Promise<void>;
  
  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean;
  
  /**
   * 获取值
   * @param key 键名
   * @returns 存储的值，不存在返回 null
   */
  get<T extends StorageValue = StorageValue>(key: string): Promise<StorageEntry<T> | null>;
  
  /**
   * 设置值
   * @param key 键名
   * @param value 值
   * @param ttl 过期时间（毫秒，可选）
   * @param metadata 元数据（可选）
   */
  set<T extends StorageValue = StorageValue>(
    key: string,
    value: T,
    ttl?: number,
    metadata?: Record<string, unknown>
  ): Promise<void>;
  
  /**
   * 删除值
   * @param key 键名
   * @returns 是否删除成功
   */
  delete(key: string): Promise<boolean>;
  
  /**
   * 检查键是否存在
   * @param key 键名
   */
  has(key: string): Promise<boolean>;
  
  /**
   * 获取所有键
   */
  keys(): Promise<string[]>;
  
  /**
   * 获取所有条目
   * @param options 查询选项
   */
  getAll<T extends StorageValue = StorageValue>(options?: StorageQueryOptions): Promise<StorageEntry<T>[]>;
  
  /**
   * 清空存储
   */
  clear(): Promise<void>;
  
  /**
   * 清理过期条目
   * @returns 清理的条目数
   */
  cleanup(): Promise<number>;
  
  /**
   * 获取存储统计
   */
  getStats(): Promise<StorageStats>;
  
  /**
   * 导出所有数据
   */
  export(): Promise<string>;
  
  /**
   * 导入数据
   * @param data JSON 字符串
   */
  import(data: string): Promise<void>;
}

/**
 * 存储事件类型
 */
export type StorageEventType = 'set' | 'delete' | 'clear' | 'expire';

/**
 * 存储事件
 */
export interface StorageEvent {
  type: StorageEventType;
  key?: string;
  storageType: StorageType;
  timestamp: number;
}

/**
 * 存储事件监听器
 */
export type StorageEventListener = (event: StorageEvent) => void;

/**
 * 存储管理器配置
 */
export interface StorageManagerConfig {
  /** 默认存储类型 */
  defaultStorage?: StorageType;
  /** 存储配置 */
  storages?: Record<StorageType, StorageConfig>;
  /** 启用事件监听 */
  enableEvents?: boolean;
}
