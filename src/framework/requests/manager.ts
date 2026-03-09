/**
 * Request Manager
 * 统一管理多个请求适配器
 */

import type {
  IRequestAdapter,
  RequestConfig,
  ResponseData,
  StreamChunk,
  RequestManagerConfig,
  RequestInterceptor,
  RetryConfig,
} from './types';

import { RequestError } from './types';
import { FetchAdapter } from './adapters/fetch';

export class RequestManager {
  private adapters: Map<string, IRequestAdapter> = new Map();
  private defaultAdapter: string = 'fetch';
  private config: RequestManagerConfig;
  private interceptors: RequestInterceptor[] = [];

  constructor(config: RequestManagerConfig = {}) {
    this.config = {
      defaultTimeout: 30000,
      ...config,
    };

    // 自动注册 fetch 适配器
    const fetchAdapter = new FetchAdapter();
    if (fetchAdapter.isSupported()) {
      this.register(fetchAdapter);
    }

    // 如果有配置拦截器
    if (config.interceptors) {
      this.interceptors = [...config.interceptors];
    }
  }

  /**
   * 注册适配器
   */
  register(adapter: IRequestAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * 获取适配器
   */
  getAdapter(name?: string): IRequestAdapter {
    const adapterName = name || this.defaultAdapter;
    const adapter = this.adapters.get(adapterName);

    if (!adapter) {
      throw new RequestError(`Adapter '${adapterName}' not found`);
    }

    return adapter;
  }

  /**
   * 设置默认适配器
   */
  setDefault(name: string): void {
    if (!this.adapters.has(name)) {
      throw new RequestError(`Cannot set default: adapter '${name}' not registered`);
    }
    this.defaultAdapter = name;
  }

  /**
   * 获取当前默认适配器名称
   */
  getDefaultAdapter(): string {
    return this.defaultAdapter;
  }

  /**
   * 列出所有已注册的适配器
   */
  listAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * 检查适配器是否可用
   */
  isAvailable(name: string): boolean {
    return this.adapters.has(name) && this.getAdapter(name).isSupported();
  }

  /**
   * 应用请求拦截器
   */
  private async applyRequestInterceptors(config: RequestConfig): Promise<RequestConfig> {
    let result = { ...config };

    for (const interceptor of this.interceptors) {
      if (interceptor.onRequest) {
        result = await interceptor.onRequest(result);
      }
    }

    return result;
  }

  /**
   * 应用响应拦截器
   */
  private async applyResponseInterceptors<T>(
    response: ResponseData<T>
  ): Promise<ResponseData<T>> {
    let result = response;

    for (const interceptor of this.interceptors) {
      if (interceptor.onResponse) {
        result = await interceptor.onResponse(result);
      }
    }

    return result;
  }

  /**
   * 应用错误拦截器
   */
  private async applyErrorInterceptors(error: RequestError): Promise<RequestError> {
    let result = error;

    for (const interceptor of this.interceptors) {
      if (interceptor.onError) {
        try {
          result = await interceptor.onError(result);
        } catch (e) {
          // 如果错误拦截器抛出错误，直接中断
          throw e;
        }
      }
    }

    return result;
  }

  /**
   * 合并配置
   */
  private mergeConfig(config: RequestConfig): RequestConfig {
    const merged: RequestConfig = {
      ...config,
    };

    // 合并基础 URL
    if (this.config.baseURL && !config.url.startsWith('http')) {
      merged.url = `${this.config.baseURL.replace(/\/$/, '')}/${config.url.replace(/^\//, '')}`;
    }

    // 合并默认请求头
    if (this.config.defaultHeaders) {
      merged.headers = {
        ...this.config.defaultHeaders,
        ...config.headers,
      };
    }

    // 合并默认超时
    if (!config.timeout && this.config.defaultTimeout) {
      merged.timeout = this.config.defaultTimeout;
    }

    return merged;
  }

  /**
   * 带重试的请求
   */
  private async requestWithRetry<T = unknown>(
    adapter: IRequestAdapter,
    config: RequestConfig,
    retryConfig?: RetryConfig
  ): Promise<ResponseData<T>> {
    const retry = {
      maxRetries: 3,
      retryDelay: 1000,
      exponentialBackoff: true,
      retryCondition: (error: RequestError) => {
        // 默认只重试网络错误和 5xx 错误
        return error.isNetworkError || (error.status !== undefined && error.status >= 500);
      },
      ...this.config.retry,
      ...retryConfig,
    };

    let lastError: RequestError | undefined;

    for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
      try {
        return await adapter.request<T>(config);
      } catch (error) {
        lastError = error instanceof RequestError ? error : new RequestError(String(error));

        // 不需要重试的错误直接抛出
        if (!retry.retryCondition(lastError)) {
          throw lastError;
        }

        // 最后一次尝试失败
        if (attempt === retry.maxRetries) {
          break;
        }

        // 计算延迟
        const delay = retry.exponentialBackoff
          ? retry.retryDelay * Math.pow(2, attempt)
          : retry.retryDelay;

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * 发送请求
   */
  async request<T = unknown>(
    config: RequestConfig,
    options?: {
      adapter?: string;
      retry?: RetryConfig;
    }
  ): Promise<ResponseData<T>> {
    const adapter = this.getAdapter(options?.adapter);

    try {
      // 合并配置
      let mergedConfig = this.mergeConfig(config);

      // 应用请求拦截器
      mergedConfig = await this.applyRequestInterceptors(mergedConfig);

      // 发送请求（带重试）
      const response = await this.requestWithRetry<T>(
        adapter,
        mergedConfig,
        options?.retry
      );

      // 应用响应拦截器
      return await this.applyResponseInterceptors(response);
    } catch (error) {
      const requestError =
        error instanceof RequestError ? error : new RequestError(String(error), { config });

      // 应用错误拦截器
      const processedError = await this.applyErrorInterceptors(requestError);
      throw processedError;
    }
  }

  /**
   * 发送 GET 请求
   */
  async get<T = unknown>(
    url: string,
    config?: Omit<RequestConfig, 'url' | 'method'>
  ): Promise<ResponseData<T>> {
    return this.request<T>({
      ...config,
      url,
      method: 'GET',
    });
  }

  /**
   * 发送 POST 请求
   */
  async post<T = unknown>(
    url: string,
    body?: unknown,
    config?: Omit<RequestConfig, 'url' | 'method' | 'body'>
  ): Promise<ResponseData<T>> {
    return this.request<T>({
      ...config,
      url,
      method: 'POST',
      body,
    });
  }

  /**
   * 发送 PUT 请求
   */
  async put<T = unknown>(
    url: string,
    body?: unknown,
    config?: Omit<RequestConfig, 'url' | 'method' | 'body'>
  ): Promise<ResponseData<T>> {
    return this.request<T>({
      ...config,
      url,
      method: 'PUT',
      body,
    });
  }

  /**
   * 发送 DELETE 请求
   */
  async delete<T = unknown>(
    url: string,
    config?: Omit<RequestConfig, 'url' | 'method'>
  ): Promise<ResponseData<T>> {
    return this.request<T>({
      ...config,
      url,
      method: 'DELETE',
    });
  }

  /**
   * 发送流式请求
   */
  async *stream(
    config: RequestConfig,
    options?: {
      adapter?: string;
    }
  ): AsyncIterableIterator<StreamChunk> {
    const adapter = this.getAdapter(options?.adapter);

    if (!adapter.stream) {
      throw new RequestError(`Adapter '${adapter.name}' does not support streaming`);
    }

    // 合并配置
    let mergedConfig = this.mergeConfig(config);

    // 应用请求拦截器
    mergedConfig = await this.applyRequestInterceptors(mergedConfig);

    try {
      yield* adapter.stream(mergedConfig);
    } catch (error) {
      const requestError =
        error instanceof RequestError ? error : new RequestError(String(error), { config });
      throw await this.applyErrorInterceptors(requestError);
    }
  }

  /**
   * 添加拦截器
   */
  addInterceptor(interceptor: RequestInterceptor): () => void {
    this.interceptors.push(interceptor);

    // 返回移除函数
    return () => {
      const index = this.interceptors.indexOf(interceptor);
      if (index > -1) {
        this.interceptors.splice(index, 1);
      }
    };
  }

  /**
   * 移除拦截器
   */
  removeInterceptor(interceptor: RequestInterceptor): void {
    const index = this.interceptors.indexOf(interceptor);
    if (index > -1) {
      this.interceptors.splice(index, 1);
    }
  }

  /**
   * 清空拦截器
   */
  clearInterceptors(): void {
    this.interceptors = [];
  }

  /**
   * 初始化适配器
   */
  async init(adapterName?: string): Promise<void> {
    if (adapterName) {
      const adapter = this.getAdapter(adapterName);
      if (adapter.init) {
        await adapter.init();
      }
    } else {
      // 初始化所有适配器
      for (const adapter of this.adapters.values()) {
        if (adapter.init) {
          await adapter.init();
        }
      }
    }
  }
}

/**
 * 创建 RequestManager 的工厂函数
 */
export function createRequestManager(config?: RequestManagerConfig): RequestManager {
  return new RequestManager(config);
}

/**
 * 全局单例
 */
let globalRequestManager: RequestManager | null = null;

/**
 * 获取全局 RequestManager
 */
export function getGlobalRequestManager(config?: RequestManagerConfig): RequestManager {
  if (!globalRequestManager) {
    globalRequestManager = new RequestManager(config);
  }
  return globalRequestManager;
}

/**
 * 设置全局 RequestManager
 */
export function setGlobalRequestManager(manager: RequestManager): void {
  globalRequestManager = manager;
}
