/**
 * IndexedDB Database Manager
 * 数据库管理和迁移系统
 */

import type {
  DatabaseConfig,
  MigrationVersion,
  MigrationStep,
  DatabaseStats,
  TransactionMode,
} from './types';

/**
 * IndexedDB 数据库管理器
 */
export class DatabaseManager {
  private config: Required<DatabaseConfig>;
  private db: globalThis.IDBDatabase | null = null;
  private initialized = false;
  private migrations: MigrationVersion[] = [];

  constructor(config: DatabaseConfig) {
    this.config = {
      autoUpgrade: true,
      debug: false,
      migrations: [],
      ...config,
    };
    this.migrations = [...(config.migrations || [])].sort((a, b) => a.version - b.version);
  }

  /**
   * 日志输出
   */
  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[IndexedDB]', ...args);
    }
  }

  /**
   * 错误日志
   */
  private error(...args: unknown[]): void {
    console.error('[IndexedDB]', ...args);
  }

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.name, this.config.version);

      request.onerror = () => {
        this.error('Failed to open database:', request.error);
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        this.log('Database opened successfully, version:', this.db.version);
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion || this.config.version;

        this.log(`Upgrading database from ${oldVersion} to ${newVersion}`);

        // 执行迁移
        if (transaction) {
          this.runMigrations(db, transaction, oldVersion, newVersion).catch((err) => {
            this.error('Migration failed:', err);
          });
        }
      };
    });
  }

  /**
   * 执行迁移
   */
  private async runMigrations(
    db: IDBDatabase,
    transaction: IDBTransaction,
    oldVersion: number,
    newVersion: number
  ): Promise<void> {
    // 获取需要执行的迁移版本
    const pendingMigrations = this.migrations.filter(
      (m) => m.version > oldVersion && m.version <= newVersion
    );

    for (const migration of pendingMigrations) {
      this.log(`Running migration version ${migration.version}:`, migration.description);

      for (const step of migration.steps) {
        await this.executeMigrationStep(db, transaction, step, oldVersion);
      }
    }
  }

  /**
   * 执行单个迁移步骤
   */
  private async executeMigrationStep(
    db: IDBDatabase,
    transaction: IDBTransaction,
    step: MigrationStep,
    oldVersion: number
  ): Promise<void> {
    const { action, model, changes, migrate } = step;

    switch (action) {
      case 'create': {
        // 创建新的对象存储
        if (!db.objectStoreNames.contains(model)) {
          const store = db.createObjectStore(model, changes as IDBObjectStoreParameters);
          this.log(`Created object store: ${model}`);

          // 创建索引
          if (changes && typeof changes === 'object') {
            const indexes = (changes as { indexes?: Array<{ name: string; keyPath: string; options?: IDBIndexParameters }> }).indexes;
            if (indexes) {
              for (const idx of indexes) {
                store.createIndex(idx.name, idx.keyPath, idx.options);
              }
            }
          }
        }
        break;
      }

      case 'alter': {
        // IndexedDB 不支持直接修改 schema，需要删除重建或创建新索引
        if (changes && typeof changes === 'object') {
          const store = transaction.objectStore(model);
          const indexes = (changes as { indexes?: Array<{ name: string; keyPath: string; options?: IDBIndexParameters; action: 'create' | 'delete' }> }).indexes;
          
          if (indexes) {
            for (const idx of indexes) {
              if (idx.action === 'create') {
                if (!store.indexNames.contains(idx.name)) {
                  store.createIndex(idx.name, idx.keyPath, idx.options);
                  this.log(`Created index: ${model}.${idx.name}`);
                }
              } else if (idx.action === 'delete') {
                if (store.indexNames.contains(idx.name)) {
                  store.deleteIndex(idx.name);
                  this.log(`Deleted index: ${model}.${idx.name}`);
                }
              }
            }
          }
        }
        break;
      }

      case 'drop': {
        // 删除对象存储
        if (db.objectStoreNames.contains(model)) {
          db.deleteObjectStore(model);
          this.log(`Dropped object store: ${model}`);
        }
        break;
      }

      case 'rename': {
        // IndexedDB 不支持重命名，需要创建新表并迁移数据
        const { newName } = changes as { newName: string };
        if (db.objectStoreNames.contains(model) && !db.objectStoreNames.contains(newName)) {
          const oldStore = transaction.objectStore(model);
          const newStore = db.createObjectStore(newName, {
            keyPath: oldStore.keyPath,
            autoIncrement: oldStore.autoIncrement,
          });

          // 复制索引
          for (const indexName of oldStore.indexNames) {
            const index = oldStore.index(indexName);
            newStore.createIndex(indexName, index.keyPath, { unique: index.unique });
          }

          this.log(`Renamed object store: ${model} -> ${newName}`);
        }
        break;
      }

      default:
        this.log(`Unknown migration action: ${action}`);
    }

    // 执行自定义迁移回调
    if (migrate) {
      await migrate(transaction, oldVersion);
    }
  }

  /**
   * 获取数据库实例
   */
  getDB(): IDBDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取事务
   */
  transaction(
    storeNames: string | string[],
    mode: TransactionMode = 'readonly'
  ): IDBTransaction {
    const db = this.getDB();
    const stores = Array.isArray(storeNames) ? storeNames : [storeNames];
    return db.transaction(stores, mode);
  }

  /**
   * 获取对象存储
   */
  getObjectStore(name: string, mode: TransactionMode = 'readonly'): IDBObjectStore {
    const transaction = this.transaction(name, mode);
    return transaction.objectStore(name);
  }

  /**
   * 检查对象存储是否存在
   */
  hasObjectStore(name: string): boolean {
    const db = this.getDB();
    return db.objectStoreNames.contains(name);
  }

  /**
   * 创建对象存储
   */
  async createObjectStore(
    name: string,
    options?: IDBObjectStoreParameters
  ): Promise<IDBObjectStore> {
    const currentVersion = this.getDB().version;
    const newVersion = currentVersion + 1;

    // 关闭当前连接
    this.close();

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.name, newVersion);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, options);
          this.log(`Created object store: ${name}`);
          resolve(store);
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
      };

      request.onerror = () => {
        reject(new Error(`Failed to create object store: ${request.error?.message}`));
      };
    });
  }

  /**
   * 删除对象存储
   */
  async deleteObjectStore(name: string): Promise<void> {
    const currentVersion = this.getDB().version;
    const newVersion = currentVersion + 1;

    this.close();

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.name, newVersion);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (db.objectStoreNames.contains(name)) {
          db.deleteObjectStore(name);
          this.log(`Deleted object store: ${name}`);
        }
        resolve();
      };

      request.onsuccess = () => {
        this.db = request.result;
      };

      request.onerror = () => {
        reject(new Error(`Failed to delete object store: ${request.error?.message}`));
      };
    });
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      this.log('Database closed');
    }
  }

  /**
   * 删除整个数据库
   */
  async destroy(): Promise<void> {
    this.close();

    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.config.name);

      request.onsuccess = () => {
        this.log(`Database ${this.config.name} deleted`);
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to delete database: ${request.error?.message}`));
      };

      request.onblocked = () => {
        this.error('Database deletion blocked');
      };
    });
  }

  /**
   * 获取数据库统计信息
   */
  async getStats(): Promise<DatabaseStats> {
    const db = this.getDB();
    const stats: DatabaseStats = {
      name: db.name,
      version: db.version,
      objectStores: Array.from(db.objectStoreNames),
      counts: {},
      estimatedSize: 0,
    };

    for (const storeName of db.objectStoreNames) {
      const transaction = this.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);

      const count = await new Promise<number>((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      stats.counts[storeName] = count;
    }

    return stats;
  }

  /**
   * 添加迁移版本
   */
  addMigration(migration: MigrationVersion): void {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.version - b.version);
  }

  /**
   * 获取迁移历史
   */
  getMigrations(): MigrationVersion[] {
    return [...this.migrations];
  }

  /**
   * 导出所有数据
   */
  async export(): Promise<Record<string, unknown[]>> {
    const db = this.getDB();
    const data: Record<string, unknown[]> = {};

    for (const storeName of db.objectStoreNames) {
      const transaction = this.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);

      const allData = await new Promise<unknown[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      data[storeName] = allData;
    }

    return data;
  }

  /**
   * 导入数据
   */
  async import(data: Record<string, unknown[]>): Promise<void> {
    const db = this.getDB();

    for (const [storeName, items] of Object.entries(data)) {
      if (!db.objectStoreNames.contains(storeName)) {
        this.error(`Object store ${storeName} does not exist, skipping`);
        continue;
      }

      const transaction = this.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      for (const item of items) {
        await new Promise<void>((resolve, reject) => {
          const request = store.put(item);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }

      this.log(`Imported ${items.length} items to ${storeName}`);
    }
  }

  /**
   * 清空所有数据
   */
  async clearAll(): Promise<void> {
    const db = this.getDB();

    for (const storeName of db.objectStoreNames) {
      const transaction = this.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      this.log(`Cleared object store: ${storeName}`);
    }
  }
}

/**
 * 数据库管理器工厂
 */
export function createDatabase(config: DatabaseConfig): DatabaseManager {
  return new DatabaseManager(config);
}

/**
 * 全局数据库实例存储
 */
const databaseInstances: Map<string, DatabaseManager> = new Map();

/**
 * 获取或创建数据库实例
 */
export function getDatabase(name: string, config?: Omit<DatabaseConfig, 'name'>): DatabaseManager {
  if (!databaseInstances.has(name)) {
    databaseInstances.set(name, new DatabaseManager({ 
      name, 
      version: 1,
      ...config 
    }));
  }
  return databaseInstances.get(name)!;
}

/**
 * 移除数据库实例
 */
export function removeDatabase(name: string): void {
  const db = databaseInstances.get(name);
  if (db) {
    db.close();
    databaseInstances.delete(name);
  }
}
