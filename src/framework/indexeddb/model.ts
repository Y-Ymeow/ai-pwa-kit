/**
 * IndexedDB Model Base Class
 * ORM 模型基类
 */

import type {
  ModelSchema,
  ModelData,
  FilterCondition,
  QueryOptions,
  BatchResult,
  ChangeLog,
  TransactionMode,
} from './types';
import type { DatabaseManager } from './database';
import { QueryBuilder } from './query';

/**
 * 模型基类
 */
export class Model<T extends ModelData = ModelData> {
  /** 数据库实例 */
  protected db: DatabaseManager;
  /** 模型名称 */
  readonly name: string;
  /** 字段定义 */
  protected schema: ModelSchema;
  /** 主键字段 */
  protected primaryKey: string;
  /** 是否启用变更日志 */
  protected enableChangeLog: boolean;

  constructor(
    db: DatabaseManager,
    name: string,
    schema: ModelSchema,
    options?: {
      enableChangeLog?: boolean;
    }
  ) {
    this.db = db;
    this.name = name;
    this.schema = schema;
    this.enableChangeLog = options?.enableChangeLog ?? false;

    // 找到主键
    const primaryField = Object.entries(schema).find(([, def]) => def.primary);
    this.primaryKey = primaryField ? primaryField[0] : 'id';
  }

  /**
   * 获取对象存储
   */
  protected getStore(mode: TransactionMode = 'readonly'): IDBObjectStore {
    return this.db.getObjectStore(this.name, mode);
  }

  /**
   * 验证数据
   */
  protected validate(data: Partial<T>): void {
    for (const [fieldName, fieldDef] of Object.entries(this.schema)) {
      const value = data[fieldName];

      // 检查必填
      if (fieldDef.primary && !fieldDef.autoIncrement) {
        if (value === undefined || value === null) {
          throw new Error(`Primary key '${fieldName}' is required`);
        }
      }

      if (fieldDef.required && (value === undefined || value === null)) {
        throw new Error(`Field '${fieldName}' is required`);
      }

      // 跳过空值
      if (value === undefined || value === null) {
        continue;
      }

      // 类型检查
      this.validateType(fieldName, value, fieldDef.type);

      // 唯一性检查（在保存时进行）
    }
  }

  /**
   * 类型验证
   */
  protected validateType(fieldName: string, value: unknown, type: string): void {
    const actualType = typeof value;

    switch (type) {
      case 'string':
        if (actualType !== 'string') {
          throw new Error(`Field '${fieldName}' must be a string`);
        }
        break;
      case 'number':
        if (actualType !== 'number') {
          throw new Error(`Field '${fieldName}' must be a number`);
        }
        break;
      case 'boolean':
        if (actualType !== 'boolean') {
          throw new Error(`Field '${fieldName}' must be a boolean`);
        }
        break;
      case 'date':
        if (!(value instanceof Date)) {
          throw new Error(`Field '${fieldName}' must be a Date`);
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          throw new Error(`Field '${fieldName}' must be an array`);
        }
        break;
      case 'object':
        if (actualType !== 'object' || value === null || Array.isArray(value)) {
          throw new Error(`Field '${fieldName}' must be an object`);
        }
        break;
      case 'json':
        // JSON 可以是任意类型，不需要验证
        break;
    }
  }

  /**
   * 序列化数据（处理特殊类型）
   */
  protected serialize(data: Partial<T>): ModelData {
    const serialized: ModelData = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;

      const fieldDef = this.schema[key];

      if (!fieldDef) {
        // 不在 schema 中的字段也保留
        serialized[key] = value;
        continue;
      }

      switch (fieldDef.type) {
        case 'date':
          serialized[key] = value instanceof Date ? value.toISOString() : value;
          break;
        case 'json':
          // JSON 类型直接存储
          serialized[key] = value;
          break;
        default:
          serialized[key] = value;
      }
    }

    // 添加时间戳
    const now = new Date().toISOString();
    if (!serialized.createdAt) {
      serialized.createdAt = now;
    }
    serialized.updatedAt = now;

    return serialized;
  }

  /**
   * 反序列化数据（还原特殊类型）
   */
  protected deserialize(data: ModelData): T {
    const deserialized = { ...data } as T;

    for (const [fieldName, fieldDef] of Object.entries(this.schema)) {
      const value = data[fieldName];

      if (value === undefined || value === null) continue;

      switch (fieldDef.type) {
        case 'date':
          (deserialized as ModelData)[fieldName] = new Date(value as string);
          break;
        case 'json':
          if (typeof value === 'string') {
            try {
              (deserialized as ModelData)[fieldName] = JSON.parse(value);
            } catch {
              (deserialized as ModelData)[fieldName] = value;
            }
          }
          break;
      }
    }

    return deserialized;
  }

  /**
   * 应用默认值
   */
  protected applyDefaults(data: Partial<T>): Partial<T> {
    const withDefaults = { ...data };

    for (const [fieldName, fieldDef] of Object.entries(this.schema)) {
      if (withDefaults[fieldName as keyof T] === undefined && fieldDef.default !== undefined) {
        (withDefaults as ModelData)[fieldName] = fieldDef.default;
      }
    }

    return withDefaults;
  }

  /**
   * 记录变更日志
   */
  protected async logChange(
    action: 'create' | 'update' | 'delete',
    id: IDBValidKey,
    oldData?: T,
    newData?: T
  ): Promise<void> {
    if (!this.enableChangeLog) return;

    const log: ChangeLog = {
      action,
      model: this.name,
      id,
      oldData,
      newData,
      timestamp: Date.now(),
    };

    try {
      const store = this.db.getObjectStore('_changelog', 'readwrite');
      await new Promise<void>((resolve, reject) => {
        const request = store.add(log);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      // 日志失败不影响主流程
    }
  }

  /**
   * 创建记录
   */
  async create(data: Partial<T>): Promise<T> {
    // 应用默认值
    const withDefaults = this.applyDefaults(data);

    // 验证
    this.validate(withDefaults);

    // 序列化
    const serialized = this.serialize(withDefaults);

    const store = this.getStore('readwrite');

    return new Promise((resolve, reject) => {
      const request = store.add(serialized);

      request.onsuccess = async () => {
        const id = request.result;
        const result = { ...serialized, [this.primaryKey]: id } as T;

        // 记录日志
        await this.logChange('create', id, undefined, result);

        resolve(this.deserialize(result));
      };

      request.onerror = () => {
        reject(new Error(`Failed to create record: ${request.error?.message}`));
      };
    });
  }

  /**
   * 批量创建
   */
  async createMany(data: Partial<T>[]): Promise<BatchResult> {
    const result: BatchResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const item of data) {
      try {
        await this.create(item);
        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push({ item, error: error as Error });
      }
    }

    return result;
  }

  /**
   * 根据主键查找
   */
  async findById(id: IDBValidKey): Promise<T | null> {
    const store = this.getStore('readonly');

    return new Promise((resolve, reject) => {
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
          resolve(this.deserialize(request.result));
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        reject(new Error(`Failed to find record: ${request.error?.message}`));
      };
    });
  }

  /**
   * 查找单条记录
   */
  async findOne(options: QueryOptions): Promise<T | null> {
    const results = await this.findMany({ ...options, limit: 1 });
    return results[0] || null;
  }

  /**
   * 查找多条记录
   */
  async findMany(options: QueryOptions = {}): Promise<T[]> {
    const builder = new QueryBuilder<T>(this.getStore('readonly'));
    return builder.execute(options);
  }

  /**
   * 查找所有记录
   */
  async findAll(): Promise<T[]> {
    const store = this.getStore('readonly');

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result.map((item) => this.deserialize(item));
        resolve(results);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get all records: ${request.error?.message}`));
      };
    });
  }

  /**
   * 更新记录
   */
  async update(id: IDBValidKey, data: Partial<T>): Promise<T | null> {
    // 获取旧数据
    const oldData = await this.findById(id);
    if (!oldData) {
      return null;
    }

    // 合并数据
    const merged = { ...oldData, ...data };

    // 验证
    this.validate(merged);

    // 序列化
    const serialized = this.serialize(merged);

    const store = this.getStore('readwrite');

    return new Promise((resolve, reject) => {
      const request = store.put(serialized);

      request.onsuccess = async () => {
        const result = serialized as T;

        // 记录日志
        await this.logChange('update', id, oldData, result);

        resolve(this.deserialize(result));
      };

      request.onerror = () => {
        reject(new Error(`Failed to update record: ${request.error?.message}`));
      };
    });
  }

  /**
   * 批量更新
   */
  async updateMany(
    where: FilterCondition,
    data: Partial<T>
  ): Promise<{ updated: number; failed: number }> {
    const records = await this.findMany({ where });
    let updated = 0;
    let failed = 0;

    for (const record of records) {
      const id = record[this.primaryKey] as IDBValidKey;
      try {
        await this.update(id, data);
        updated++;
      } catch {
        failed++;
      }
    }

    return { updated, failed };
  }

  /**
   * 删除记录
   */
  async delete(id: IDBValidKey): Promise<boolean> {
    // 获取旧数据用于日志
    const oldData = this.enableChangeLog ? await this.findById(id) : undefined;

    const store = this.getStore('readwrite');

    return new Promise((resolve, reject) => {
      const request = store.delete(id);

      request.onsuccess = async () => {
        // 记录日志
        if (oldData) {
          await this.logChange('delete', id, oldData, undefined);
        }

        resolve(true);
      };

      request.onerror = () => {
        reject(new Error(`Failed to delete record: ${request.error?.message}`));
      };
    });
  }

  /**
   * 批量删除
   */
  async deleteMany(where: FilterCondition): Promise<{ deleted: number; failed: number }> {
    const records = await this.findMany({ where });
    let deleted = 0;
    let failed = 0;

    for (const record of records) {
      const id = record[this.primaryKey] as IDBValidKey;
      try {
        await this.delete(id);
        deleted++;
      } catch {
        failed++;
      }
    }

    return { deleted, failed };
  }

  /**
   * 清空所有记录
   */
  async clear(): Promise<void> {
    const store = this.getStore('readwrite');

    return new Promise((resolve, reject) => {
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to clear records: ${request.error?.message}`));
    });
  }

  /**
   * 计数
   */
  async count(where?: FilterCondition): Promise<number> {
    if (!where) {
      const store = this.getStore('readonly');
      return new Promise((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    // 有过滤条件时需要先查询
    const records = await this.findMany({ where });
    return records.length;
  }

  /**
   * 检查记录是否存在
   */
  async exists(id: IDBValidKey): Promise<boolean> {
    const record = await this.findById(id);
    return record !== null;
  }

  /**
   * 递增字段值
   */
  async increment(id: IDBValidKey, field: keyof T, amount: number = 1): Promise<T | null> {
    const record = await this.findById(id);
    if (!record) return null;

    const currentValue = (record[field] as number) || 0;
    const updateData = { [field]: currentValue + amount } as Partial<T>;

    return this.update(id, updateData);
  }

  /**
   * 创建或更新（UPSERT）
   */
  async upsert(data: Partial<T> & { [key: string]: unknown }): Promise<T> {
    const id = data[this.primaryKey] as IDBValidKey;

    if (id !== undefined) {
      const existing = await this.findById(id);
      if (existing) {
        return this.update(id, data) as Promise<T>;
      }
    }

    return this.create(data);
  }

  /**
   * 获取主键名
   */
  getPrimaryKey(): string {
    return this.primaryKey;
  }

  /**
   * 获取 Schema
   */
  getSchema(): ModelSchema {
    return { ...this.schema };
  }
}

/**
 * 创建模型工厂函数
 */
export function createModel<T extends ModelData>(
  db: DatabaseManager,
  name: string,
  schema: ModelSchema,
  options?: {
    enableChangeLog?: boolean;
  }
): Model<T> {
  return new Model<T>(db, name, schema, options);
}
