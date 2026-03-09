/**
 * Fetch Adapter
 * 基于浏览器 fetch API 的请求适配器
 */

import type {
  IRequestAdapter,
  RequestConfig,
  ResponseData,
  StreamChunk,
} from '../types';

import { RequestError } from '../types';

export class FetchAdapter implements IRequestAdapter {
  readonly name = 'fetch';

  /**
   * 检查是否支持 fetch
   */
  isSupported(): boolean {
    return typeof fetch !== 'undefined';
  }

  /**
   * 构建完整 URL（包含查询参数）
   */
  private buildURL(url: string, params?: Record<string, unknown>): string {
    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }

    const queryString = searchParams.toString();
    if (!queryString) return url;

    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${queryString}`;
  }

  /**
   * 提取响应头
   */
  private extractHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }

  /**
   * 解析响应体
   */
  private async parseResponse<T>(
    response: Response,
    responseType?: string
  ): Promise<T> {
    if (responseType === 'text') {
      return response.text() as Promise<T>;
    }
    if (responseType === 'blob') {
      return response.blob() as Promise<T>;
    }
    if (responseType === 'arraybuffer') {
      return response.arrayBuffer() as Promise<T>;
    }
    // 默认 JSON
    return response.json() as Promise<T>;
  }

  /**
   * 发送请求
   */
  async request<T = unknown>(config: RequestConfig): Promise<ResponseData<T>> {
    if (!this.isSupported()) {
      throw new RequestError('Fetch API is not supported in this environment', {
        isNetworkError: true,
        config,
      });
    }

    const url = this.buildURL(config.url, config.params);
    const timeout = config.timeout || 30000;

    // 创建 AbortController 用于超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // 合并信号
    if (config.signal) {
      config.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        method: config.method || 'GET',
        headers: config.headers,
        body: config.body ? JSON.stringify(config.body) : undefined,
        credentials: config.withCredentials ? 'include' : 'same-origin',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData: unknown;
        try {
          errorData = await response.json();
        } catch {
          errorData = await response.text();
        }

        throw new RequestError(
          `HTTP ${response.status}: ${response.statusText}`,
          {
            status: response.status,
            response: errorData,
            config,
          }
        );
      }

      const data = await this.parseResponse<T>(response, config.responseType);

      return {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: this.extractHeaders(response),
        raw: response,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof RequestError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new RequestError('Request timeout', {
            isTimeout: true,
            config,
          });
        }
        throw new RequestError(error.message, {
          isNetworkError: true,
          config,
        });
      }

      throw new RequestError('Unknown error', { config });
    }
  }

  /**
   * 发送流式请求
   */
  async *stream(config: RequestConfig): AsyncIterableIterator<StreamChunk> {
    if (!this.isSupported()) {
      throw new RequestError('Fetch API is not supported in this environment', {
        isNetworkError: true,
        config,
      });
    }

    const url = this.buildURL(config.url, config.params);
    const timeout = config.timeout || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    if (config.signal) {
      config.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        method: config.method || 'POST',
        headers: {
          'Accept': 'text/event-stream',
          ...config.headers,
        },
        body: config.body ? JSON.stringify(config.body) : undefined,
        credentials: config.withCredentials ? 'include' : 'same-origin',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new RequestError(
          `HTTP ${response.status}: ${response.statusText}`,
          {
            status: response.status,
            config,
          }
        );
      }

      if (!response.body) {
        throw new RequestError('No response body', { config });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            yield { data: '', done: true };
            return;
          }

          const chunk = decoder.decode(value, { stream: true });
          yield { data: chunk, done: false };
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof RequestError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new RequestError('Request timeout', {
            isTimeout: true,
            config,
          });
        }
        throw new RequestError(error.message, {
          isNetworkError: true,
          config,
        });
      }

      throw new RequestError('Unknown error', { config });
    }
  }
}
