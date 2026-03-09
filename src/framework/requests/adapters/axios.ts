/**
 * Axios Adapter
 * 基于 Axios 的请求适配器
 */

import type {
  IRequestAdapter,
  RequestConfig,
  ResponseData,
  StreamChunk,
} from '../types';

import { RequestError } from '../types';

/**
 * Axios 实例接口（避免直接依赖 axios）
 */
export interface AxiosInstance {
  request<T = unknown>(config: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    data?: unknown;
    params?: Record<string, unknown>;
    timeout?: number;
    withCredentials?: boolean;
    responseType?: string;
    signal?: AbortSignal;
  }): Promise<{
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string>;
  }>;
  
  get<T = unknown>(url: string, config?: unknown): Promise<{ data: T }>;
  post<T = unknown>(url: string, data?: unknown, config?: unknown): Promise<{ data: T }>;
}

export interface AxiosStatic {
  create(config?: unknown): AxiosInstance;
  request<T = unknown>(config: unknown): Promise<{ data: T }>;
}

export class AxiosAdapter implements IRequestAdapter {
  readonly name = 'axios';
  private axios: AxiosInstance | null = null;
  private axiosFactory: AxiosStatic | null = null;

  constructor(axiosInstance?: AxiosInstance | AxiosStatic) {
    if (axiosInstance) {
      // 检查是实例还是静态类
      if ('request' in axiosInstance && typeof axiosInstance.request === 'function') {
        // 可能是实例或静态类
        if ('create' in axiosInstance && typeof axiosInstance.create === 'function') {
          // 是静态类
          this.axiosFactory = axiosInstance as AxiosStatic;
        } else {
          // 是实例
          this.axios = axiosInstance as AxiosInstance;
        }
      }
    }
  }

  /**
   * 检查是否支持 axios
   */
  isSupported(): boolean {
    // 如果已注入 axios 实例或全局存在 axios
    return !!(
      this.axios ||
      this.axiosFactory ||
      (typeof window !== 'undefined' && (window as { axios?: unknown }).axios)
    );
  }

  /**
   * 获取 axios 实例
   */
  private getAxios(): AxiosInstance {
    if (this.axios) {
      return this.axios;
    }

    if (this.axiosFactory) {
      this.axios = this.axiosFactory.create();
      return this.axios;
    }

    // 尝试从全局获取
    const globalAxios = (typeof window !== 'undefined' && (window as { axios?: AxiosStatic }).axios);
    if (globalAxios) {
      this.axiosFactory = globalAxios;
      this.axios = globalAxios.create();
      return this.axios;
    }

    throw new RequestError('Axios is not available', {
      isNetworkError: true,
    });
  }

  /**
   * 发送请求
   */
  async request<T = unknown>(config: RequestConfig): Promise<ResponseData<T>> {
    const axios = this.getAxios();

    try {
      const response = await axios.request<T>({
        url: config.url,
        method: config.method || 'GET',
        headers: config.headers,
        data: config.body,
        params: config.params,
        timeout: config.timeout || 30000,
        withCredentials: config.withCredentials,
        responseType: config.responseType || 'json',
        signal: config.signal,
      });

      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      };
    } catch (error) {
      if (error && typeof error === 'object') {
        const axiosError = error as {
          response?: {
            data?: unknown;
            status?: number;
            statusText?: string;
          };
          request?: unknown;
          message?: string;
          code?: string;
        };

        // 服务器返回错误
        if (axiosError.response) {
          throw new RequestError(
            `HTTP ${axiosError.response.status}: ${axiosError.response.statusText || 'Error'}`,
            {
              status: axiosError.response.status,
              response: axiosError.response.data,
              config,
            }
          );
        }

        // 请求发出但没有收到响应
        if (axiosError.request) {
          if (axiosError.code === 'ECONNABORTED') {
            throw new RequestError('Request timeout', {
              isTimeout: true,
              config,
            });
          }
          throw new RequestError(axiosError.message || 'Network error', {
            isNetworkError: true,
            config,
          });
        }

        // 其他错误
        throw new RequestError(axiosError.message || 'Unknown error', {
          config,
        });
      }

      throw new RequestError('Unknown error', { config });
    }
  }

  /**
   * 发送流式请求
   * 注意：Axios 对 SSE/流式支持不如 fetch，这里模拟实现
   */
  async *stream(config: RequestConfig): AsyncIterableIterator<StreamChunk> {
    const axios = this.getAxios();

    try {
      // Axios 不原生支持流式响应体迭代
      // 这里使用 responseType: 'stream'（Node.js）或退回到 fetch 方式
      
      // 如果在浏览器环境，尝试使用 fetch 进行流式请求
      if (typeof fetch !== 'undefined') {
        const fetchAdapter = (await import('./fetch')).FetchAdapter;
        const fetch = new fetchAdapter();
        yield* fetch.stream(config);
        return;
      }

      // Node.js 环境使用 axios 的 stream 响应
      const response = await axios.request({
        url: config.url,
        method: config.method || 'POST',
        headers: {
          'Accept': 'text/event-stream',
          ...config.headers,
        },
        data: config.body,
        params: config.params,
        timeout: config.timeout || 30000,
        // @ts-ignore - responseType: 'stream' 只在 Node.js 有效
        responseType: 'stream',
      });

      // 在 Node.js 中，response.data 是流
      const stream = response.data as {
        on(event: string, callback: (chunk: unknown) => void): void;
      };

      const chunks: string[] = [];
      let resolver: (() => void) | null = null;

      stream.on('data', (chunk: unknown) => {
        chunks.push(typeof chunk === 'string' ? chunk : String(chunk));
        if (resolver) {
          resolver();
          resolver = null;
        }
      });

      stream.on('end', () => {
        chunks.push(''); // 标记结束
        if (resolver) {
          resolver();
          resolver = null;
        }
      });

      while (true) {
        if (chunks.length === 0) {
          await new Promise<void>((resolve) => {
            resolver = resolve;
          });
        }

        const chunk = chunks.shift();
        if (chunk === '') {
          yield { data: '', done: true };
          return;
        }

        yield { data: chunk || '', done: false };
      }
    } catch (error) {
      if (error instanceof RequestError) {
        throw error;
      }

      throw new RequestError(
        error instanceof Error ? error.message : 'Stream error',
        { config }
      );
    }
  }

  /**
   * 设置 axios 实例
   */
  setAxiosInstance(axios: AxiosInstance): void {
    this.axios = axios;
  }

  /**
   * 从工厂创建新实例
   */
  createInstance(factory: AxiosStatic): AxiosAdapter {
    return new AxiosAdapter(factory);
  }
}
