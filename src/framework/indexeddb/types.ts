/**
 * IndexedDB ORM Types
 * IndexedDB 类 ORM 模块的类型定义
 */

/**
 * 支持的字段类型
 */
export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'json';

/**
 * 字段定义
 */
export interface FieldDefinition {
  /** 字段类型 */
  type: FieldType;
  /** 是否主键 */
  primary?: boolean;
  /** 是否自增 */
  autoIncrement?: boolean;
  /** 是否可空 */
  nullable?: boolean;
  /** 是否必填 */
  required?: boolean;
  /** 默认值 */
  default?: unknown;
  /** 是否唯一 */
  unique?: boolean;
  /** 是否建立索引 */
  index?: boolean;
  /** 字段描述 */
  description?: string;
}

/**
 * 模型 schema 定义
 */
export interface ModelSchema {
  [fieldName: string]: FieldDefinition;
}

/**
 * 模型元数据
 */
export interface ModelMetadata {
  /** 模型名称（表名） */
  name: string;
  /** 主键字段名 */
  primaryKey: string;
  /** 字段定义 */
  fields: ModelSchema;
  /** 版本号 */
  version: number;
  /** 索引列表 */
  indexes: string[];
}

/**
 * 模型实例数据
 */
export interface ModelData {
  [key: string]: unknown;
}

/**
 * 查询条件
 */
export interface QueryCondition {
  /** 等于 */
  $eq?: unknown;
  /** 不等于 */
  $ne?: unknown;
  /** 大于 */
  $gt?: unknown;
  /** 大于等于 */
  $gte?: unknown;
  /** 小于 */
  $lt?: unknown;
  /** 小于等于 */
  $lte?: unknown;
  /** 包含（数组/字符串） */
  $in?: unknown[];
  /** 不包含 */
  $nin?: unknown[];
  /** 模糊匹配 */
  $like?: string;
  /** 正则匹配 */
  $regex?: RegExp;
  /** 存在 */
  $exists?: boolean;
  /** 范围查询 */
  $between?: [unknown, unknown];
}

/**
 * 查询过滤条件
 */
export type FilterCondition = {
  [field: string]: QueryCondition | unknown;
} & {
  /** AND 条件 */
  $and?: FilterCondition[];
  /** OR 条件 */
  $or?: FilterCondition[];
  /** NOT 条件 */
  $not?: FilterCondition;
};

/**
 * 排序方向
 */
export type SortDirection = 'asc' | 'desc';

/**
 * 排序选项
 */
export interface SortOptions {
  [field: string]: SortDirection;
}

/**
 * 查询选项
 */
export interface QueryOptions {
  /** 过滤条件 */
  where?: FilterCondition;
  /** 排序 */
  orderBy?: SortOptions;
  /** 偏移量 */
  offset?: number;
  /** 限制数量 */
  limit?: number;
  /** 只返回指定字段 */
  select?: string[];
  /** 排除指定字段 */
  exclude?: string[];
}

/**
 * 迁移操作类型
 */
export type MigrationAction = 'create' | 'alter' | 'drop' | 'rename' | 'index';

/**
 * 迁移步骤
 */
export interface MigrationStep {
  /** 操作类型 */
  action: MigrationAction;
  /** 模型名称 */
  model: string;
  /** 变更详情 */
  changes?: unknown;
  /** 回调函数（用于数据迁移） */
  migrate?: (transaction: IDBTransaction, oldVersion: number) => Promise<void> | void;
}

/**
 * 迁移版本
 */
export interface MigrationVersion {
  /** 版本号 */
  version: number;
  /** 版本描述 */
  description?: string;
  /** 迁移步骤 */
  steps: MigrationStep[];
}

/**
 * 数据库配置
 */
export interface DatabaseConfig {
  /** 数据库名称 */
  name: string;
  /** 数据库版本 */
  version: number;
  /** 迁移历史 */
  migrations?: MigrationVersion[];
  /** 是否自动升级 */
  autoUpgrade?: boolean;
  /** 调试模式 */
  debug?: boolean;
}

/**
 * 事务模式
 */
export type TransactionMode = 'readonly' | 'readwrite';

/**
 * 数据库统计信息
 */
export interface DatabaseStats {
  /** 数据库名称 */
  name: string;
  /** 当前版本 */
  version: number;
  /** 对象存储列表 */
  objectStores: string[];
  /** 每个存储的条目数 */
  counts: Record<string, number>;
  /** 总大小估算（字节） */
  estimatedSize: number;
}

/**
 * 模型关系类型
 */
export type RelationType = 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany';

/**
 * 关系定义
 */
export interface RelationDefinition {
  /** 关系类型 */
  type: RelationType;
  /** 关联模型 */
  model: string;
  /** 外键字段 */
  foreignKey?: string;
  /** 本地键 */
  localKey?: string;
  /** 中间表（多对多） */
  through?: string;
}

/**
 * 批量操作结果
 */
export interface BatchResult {
  /** 成功数量 */
  success: number;
  /** 失败数量 */
  failed: number;
  /** 错误信息 */
  errors: Array<{ item: unknown; error: Error }>;
}

/**
 * 变更日志（用于数据追踪）
 */
export interface ChangeLog {
  /** 操作类型 */
  action: 'create' | 'update' | 'delete';
  /** 模型名称 */
  model: string;
  /** 记录ID */
  id: IDBValidKey;
  /** 变更前数据 */
  oldData?: ModelData;
  /** 变更后数据 */
  newData?: ModelData;
  /** 时间戳 */
  timestamp: number;
}
