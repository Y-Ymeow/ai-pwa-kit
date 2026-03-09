/**
 * IndexedDB ORM Module
 * 类 ORM 的 IndexedDB 操作模块
 *
 * @example
 * ```typescript
 * import {
 *   IDBDatabase,
 *   Model,
 *   createDatabase,
 *   defineSchema,
 *   field
 * } from './indexeddb';
 *
 * // 创建数据库
 * const db = createDatabase({
 *   name: 'my-app',
 *   version: 1,
 *   migrations: [
 *     {
 *       version: 1,
 *       description: 'Initial schema',
 *       steps: [
 *         {
 *           action: 'create',
 *           model: 'users',
 *           changes: { keyPath: 'id', autoIncrement: true }
 *         }
 *       ]
 *     }
 *   ]
 * });
 *
 * await db.init();
 *
 * // 定义模型
 * const User = new Model(db, 'users', {
 *   id: field.primary(),
 *   name: field.string({ required: true }),
 *   email: field.string({ unique: true }),
 *   age: field.number(),
 *   createdAt: field.date({ default: () => new Date() })
 * });
 *
 * // CRUD 操作
 * const user = await User.create({ name: '张三', email: 'zhang@example.com', age: 25 });
 * const found = await User.findById(user.id);
 * const updated = await User.update(user.id, { age: 26 });
 * await User.delete(user.id);
 *
 * // 查询
 * const users = await User.findMany({
 *   where: { age: { $gte: 18 }, name: { $like: '张%' } },
 *   orderBy: { createdAt: 'desc' },
 *   limit: 10
 * });
 * ```
 */

import type {
  FieldDefinition,
  ModelSchema,
  ModelData,
} from './types';

import { DatabaseManager } from './database';
import { Model } from './model';

// 类型导出
export type {
  FieldType,
  FieldDefinition,
  ModelSchema,
  ModelMetadata,
  ModelData,
  QueryCondition,
  FilterCondition,
  SortDirection,
  SortOptions,
  QueryOptions,
  MigrationAction,
  MigrationStep,
  MigrationVersion,
  DatabaseConfig,
  TransactionMode,
  DatabaseStats,
  RelationType,
  RelationDefinition,
  BatchResult,
  ChangeLog,
} from './types';

// 数据库管理
export {
  DatabaseManager,
  createDatabase,
  getDatabase,
  removeDatabase,
} from './database';

// 为向后兼容保留 IDBDatabase 别名
export { DatabaseManager as IDBDatabase } from './database';

// 模型
export {
  Model,
  createModel,
} from './model';

// 查询构建器
export { QueryBuilder } from './query';

// Schema 定义助手
export const field = {
  /**
   * 字符串字段
   */
  string(options: Omit<FieldDefinition, 'type'> = {}): FieldDefinition {
    return { type: 'string', ...options };
  },

  /**
   * 数字字段
   */
  number(options: Omit<FieldDefinition, 'type'> = {}): FieldDefinition {
    return { type: 'number', ...options };
  },

  /**
   * 布尔字段
   */
  boolean(options: Omit<FieldDefinition, 'type'> = {}): FieldDefinition {
    return { type: 'boolean', ...options };
  },

  /**
   * 日期字段
   */
  date(options: Omit<FieldDefinition, 'type'> = {}): FieldDefinition {
    return { type: 'date', ...options };
  },

  /**
   * 数组字段
   */
  array(options: Omit<FieldDefinition, 'type'> = {}): FieldDefinition {
    return { type: 'array', ...options };
  },

  /**
   * 对象字段
   */
  object(options: Omit<FieldDefinition, 'type'> = {}): FieldDefinition {
    return { type: 'object', ...options };
  },

  /**
   * JSON 字段
   */
  json(options: Omit<FieldDefinition, 'type'> = {}): FieldDefinition {
    return { type: 'json', ...options };
  },

  /**
   * 主键字段
   */
  primary(options: Omit<FieldDefinition, 'type' | 'primary'> = {}): FieldDefinition {
    return { type: 'number', primary: true, autoIncrement: true, ...options };
  },

  /**
   * UUID 字段
   */
  uuid(options: Omit<FieldDefinition, 'type'> = {}): FieldDefinition {
    return {
      type: 'string',
      primary: true,
      default: () => generateUUID(),
      ...options,
    };
  },
};

/**
 * 生成 UUID
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Schema 定义助手
 */
export function defineSchema(fields: ModelSchema): ModelSchema {
  return fields;
}

/**
 * 创建模型类工厂
 */
export function createModelClass<T extends ModelData>(
  db: DatabaseManager,
  name: string,
  schema: ModelSchema
): Model<T> {
  return new Model<T>(db, name, schema);
}
