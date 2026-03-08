/**
 * Requests Types
 * 请求模块的类型定义
 */

/**
 * HTTP 方法
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * 请求配置
 */
export interface RequestConfig {
  /** 请求 URL */
  url: string;
  /** 请求方法 */
  method?: HttpMethod;
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求体 */
  body?: unknown;
  /** 查询参数 */
  params?: Record<string, unknown>;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否跨域携带 cookie */
  withCredentials?: boolean;
  /** 响应类型 */
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer';
  /** 取消信号 */
  signal?: AbortSignal;
}

/**
 * 响应结构
 */
export interface ResponseData<T = unknown> {
  /** 响应数据 */
  data: T;
  /** HTTP 状态码 */
  status: number;
  /** 状态文本 */
  statusText: string;
  /** 响应头 */
  headers: Record<string, string>;
  /** 原始响应 */
  raw?: unknown;
}

/**
 * 流式响应块
 */
export interface StreamChunk {
  /** 数据内容 */
  data: string;
  /** 是否完成 */
  done: boolean;
}

/**
 * 请求错误
 */
export class RequestError extends Error {
  /** HTTP 状态码 */
  status?: number;
  /** 错误响应数据 */
  response?: unknown;
  /** 是否是网络错误 */
  isNetworkError: boolean;
  /** 是否是超时 */
  isTimeout: boolean;
  /** 配置 */
  config?: RequestConfig;

  constructor(
    message: string,
    options?: {
      status?: number;
      response?: unknown;
      isNetworkError?: boolean;
      isTimeout?: boolean;
      config?: RequestConfig;
    }
  ) {
    super(message);
    this.name = 'RequestError';
    this.status = options?.status;
    this.response = options?.response;
    this.isNetworkError = options?.isNetworkError ?? false;
    this.isTimeout = options?.isTimeout ?? false;
    this.config = options?.config;
  }
}

/**
 * 请求适配器接口
 * 所有请求实现必须遵循
 */
export interface IRequestAdapter {
  /** 适配器名称 */
  readonly name: string;
  
  /**
   * 检查当前环境是否支持该适配器
   */
  isSupported(): boolean;
  
  /**
   * 初始化适配器
   */
  init?(): Promise<void>;
  
  /**
   * 发送请求
   */
  request<T = unknown>(config: RequestConfig): Promise<ResponseData<T>>;
  
  /**
   * 发送流式请求
   */
  stream?(config: RequestConfig): AsyncIterableIterator<StreamChunk>;
}

/**
 * 外部请求接口定义（用于油猴脚本/Chrome插件）
 */
export interface ExternalRequestInterface {
  /**
   * 发送请求
   */
  request(config: RequestConfig): Promise<ResponseData<unknown>>;
  
  /**
   * 发送流式请求
   */
  stream?(config: RequestConfig): AsyncIterableIterator<StreamChunk>;
}

/**
 * 外部适配器配置
 */
export interface ExternalAdapterConfig {
  /** 获取外部请求接口的方法 */
  getInterface: () => ExternalRequestInterface | null | undefined;
  /** 适配器名称 */
  name?: string;
}

/**
 * 请求拦截器
 */
export interface RequestInterceptor {
  onRequest?(config: RequestConfig): RequestConfig | Promise<RequestConfig>;
  onResponse?<T>(response: ResponseData<T>): ResponseData<T> | Promise<ResponseData<T>>;
  onError?(error: RequestError): RequestError | Promise<RequestError> | never;
}

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
  /** 是否使用指数退避 */
  exponentialBackoff?: boolean;
  /** 自定义重试条件 */
  retryCondition?: (error: RequestError) => boolean;
}

/**
 * 请求管理器配置
 */
export interface RequestManagerConfig {
  /** 默认适配器 */
  defaultAdapter?: string;
  /** 基础 URL */
  baseURL?: string;
  /** 默认请求头 */
  defaultHeaders?: Record<string, string>;
  /** 默认超时 */
  defaultTimeout?: number;
  /** 重试配置 */
  retry?: RetryConfig;
  /** 拦截器 */
  interceptors?: RequestInterceptor[];
}

/**
 * 适配器构造器
 */
export type AdapterConstructor = new (...args: unknown[]) => IRequestAdapter;
