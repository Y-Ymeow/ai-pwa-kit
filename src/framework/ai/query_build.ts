/**
 * Query Builder Module
 * 负责参数组装、验证和请求构建
 */

export type ArgType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface ArgDefinition {
  type: ArgType;
  required?: boolean;
  default?: unknown;
  description?: string;
  validate?: (value: unknown) => boolean | string;
}

export interface ArgSchema {
  [key: string]: ArgDefinition;
}

export interface BuildOptions {
  strict?: boolean; // 是否严格模式（不允许额外字段）
}

export class ArgsBuilder {
  private schema: ArgSchema;

  constructor(schema: ArgSchema = {}) {
    this.schema = schema;
  }

  /**
   * 设置 Schema
   */
  setSchema(schema: ArgSchema): void {
    this.schema = schema;
  }

  /**
   * 获取 Schema
   */
  getSchema(): ArgSchema {
    return { ...this.schema };
  }

  /**
   * 构建参数
   */
  build(args: Record<string, unknown>, options: BuildOptions = {}): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const { strict = false } = options;

    // 处理 schema 中定义的字段
    for (const [key, definition] of Object.entries(this.schema)) {
      const value = args[key];

      // 检查必填
      if (definition.required && (value === undefined || value === null)) {
        // 使用默认值
        if (definition.default !== undefined) {
          result[key] = definition.default;
          continue;
        }
        throw new Error(`Missing required argument: ${key}`);
      }

      // 跳过未提供的非必填字段
      if (value === undefined || value === null) {
        if (definition.default !== undefined) {
          result[key] = definition.default;
        }
        continue;
      }

      // 类型检查
      const typeError = this.validateType(key, value, definition.type);
      if (typeError) {
        throw new Error(typeError);
      }

      // 自定义验证
      if (definition.validate) {
        const validateResult = definition.validate(value);
        if (validateResult !== true) {
          throw new Error(
            typeof validateResult === 'string'
              ? validateResult
              : `Validation failed for ${key}`
          );
        }
      }

      result[key] = value;
    }

    // 严格模式下不允许额外字段
    if (strict) {
      for (const key of Object.keys(args)) {
        if (!(key in this.schema)) {
          throw new Error(`Unknown argument: ${key}`);
        }
      }
    } else {
      // 非严格模式，添加未定义的字段
      for (const [key, value] of Object.entries(args)) {
        if (!(key in result)) {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * 类型验证
   */
  private validateType(key: string, value: unknown, type: ArgType): string | null {
    const actualType = this.getType(value);

    switch (type) {
      case 'string':
        if (actualType !== 'string') return `${key} must be a string`;
        break;
      case 'number':
        if (actualType !== 'number') return `${key} must be a number`;
        break;
      case 'boolean':
        if (actualType !== 'boolean') return `${key} must be a boolean`;
        break;
      case 'array':
        if (!Array.isArray(value)) return `${key} must be an array`;
        break;
      case 'object':
        if (actualType !== 'object' || value === null || Array.isArray(value)) {
          return `${key} must be an object`;
        }
        break;
    }

    return null;
  }

  /**
   * 获取值的类型
   */
  private getType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  /**
   * 批量构建（用于多个请求）
   */
  buildBatch(
    argsList: Record<string, unknown>[],
    options?: BuildOptions
  ): Record<string, unknown>[] {
    return argsList.map((args) => this.build(args, options));
  }

  /**
   * 添加单个字段定义
   */
  addField(key: string, definition: ArgDefinition): void {
    this.schema[key] = definition;
  }

  /**
   * 移除字段定义
   */
  removeField(key: string): void {
    delete this.schema[key];
  }
}

/**
 * 快速构建工具函数
 */
export function buildArgs(
  schema: ArgSchema,
  args: Record<string, unknown>,
  options?: BuildOptions
): Record<string, unknown> {
  const builder = new ArgsBuilder(schema);
  return builder.build(args, options);
}

/**
 * HTTP Headers 构建器配置
 */
export interface HeadersConfig {
  /** API 密钥 */
  apiKey: string;
  /** 额外请求头 */
  headers?: Record<string, string>;
  /** 认证类型，默认 Bearer */
  authType?: 'Bearer' | 'Basic' | 'ApiKey';
}

/**
 * OpenAI 特定的 Headers 配置
 */
export interface OpenAIHeadersConfig extends HeadersConfig {
  /** Organization ID */
  organization?: string;
  /** Project ID */
  project?: string;
}

/**
 * 构建标准 HTTP Headers
 */
export function buildHeaders(config: HeadersConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  };

  const authType = config.authType || 'Bearer';

  switch (authType) {
    case 'Bearer':
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      break;
    case 'Basic':
      headers['Authorization'] = `Basic ${config.apiKey}`;
      break;
    case 'ApiKey':
      headers['X-Api-Key'] = config.apiKey;
      break;
  }

  return headers;
}

/**
 * 构建 OpenAI 特定的 HTTP Headers
 */
export function buildOpenAIHeaders(config: OpenAIHeadersConfig): Record<string, string> {
  const headers = buildHeaders({
    apiKey: config.apiKey,
    headers: config.headers,
    authType: 'Bearer',
  });

  if (config.organization) {
    headers['OpenAI-Organization'] = config.organization;
  }
  if (config.project) {
    headers['OpenAI-Project'] = config.project;
  }

  return headers;
}

/**
 * Query 构建器
 * 用于构建 URL、参数等
 */
export class QueryBuilder {
  private params = new Map<string, string>();

  /**
   * 添加参数
   */
  add(key: string, value: unknown): this {
    if (value !== undefined && value !== null) {
      this.params.set(key, String(value));
    }
    return this;
  }

  /**
   * 批量添加参数
   */
  addMany(params: Record<string, unknown>): this {
    for (const [key, value] of Object.entries(params)) {
      this.add(key, value);
    }
    return this;
  }

  /**
   * 构建查询字符串
   */
  build(): string {
    if (this.params.size === 0) return '';

    const pairs: string[] = [];
    for (const [key, value] of this.params) {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
    return `?${pairs.join('&')}`;
  }

  /**
   * 构建完整 URL
   */
  buildUrl(baseUrl: string): string {
    const query = this.build();
    return `${baseUrl}${query}`;
  }

  /**
   * 清空参数
   */
  clear(): this {
    this.params.clear();
    return this;
  }

  /**
   * 获取当前参数数量
   */
  size(): number {
    return this.params.size;
  }
}

/**
 * 快速构建查询字符串
 */
export function buildQueryString(params: Record<string, unknown>): string {
  const builder = new QueryBuilder();
  builder.addMany(params);
  return builder.build();
}
