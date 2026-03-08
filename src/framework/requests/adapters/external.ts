/**
 * External Adapter
 * 用于连接外部请求接口（油猴脚本 GM_xmlhttpRequest / Chrome 插件 / 其他）
 * 可以绕过浏览器的 CORS 限制
 */

import type {
  IRequestAdapter,
  RequestConfig,
  ResponseData,
  StreamChunk,
  RequestError,
  ExternalRequestInterface,
  ExternalAdapterConfig,
} from '../types';

/**
 * 油猴 GM_xmlhttpRequest 接口定义
 */
export interface GM_xmlhttpRequest {
  (details: {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    data?: string;
    timeout?: number;
    responseType?: string;
    onload?: (response: {
      status: number;
      statusText: string;
      responseText: string;
      responseHeaders: string;
    }) => void;
    onerror?: (error: unknown) => void;
    ontimeout?: () => void;
    onabort?: () => void;
    onreadystatechange?: (response: { readyState: number }) => void;
  }): { abort: () => void };
}

/**
 * Chrome 插件消息接口
 */
export interface ChromeExtensionInterface {
  sendMessage: (
    message: {
      type: 'request';
      config: RequestConfig;
    },
    callback: (response: {
      success: boolean;
      data?: unknown;
      status?: number;
      statusText?: string;
      headers?: Record<string, string>;
      error?: string;
    }) => void
  ) => void;
}

/**
 * 外部适配器 - 用于连接油猴脚本或 Chrome 插件提供的请求接口
 */
export class ExternalAdapter implements IRequestAdapter {
  readonly name: string;
  private config: ExternalAdapterConfig;
  private interface: ExternalRequestInterface | null = null;

  constructor(config: ExternalAdapterConfig) {
    this.config = config;
    this.name = config.name || 'external';
  }

  /**
   * 检查外部接口是否可用
   */
  isSupported(): boolean {
    const iface = this.config.getInterface();
    return !!iface && typeof iface.request === 'function';
  }

  /**
   * 初始化 - 尝试获取外部接口
   */
  async init(): Promise<void> {
    const iface = this.config.getInterface();
    if (!iface) {
      throw new RequestError('External request interface not available', {
        isNetworkError: true,
      });
    }
    this.interface = iface;
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): ExternalRequestInterface {
    if (!this.interface) {
      const iface = this.config.getInterface();
      if (!iface) {
        throw new RequestError('External request interface not initialized', {
          isNetworkError: true,
        });
      }
      this.interface = iface;
    }
    return this.interface;
  }

  /**
   * 发送请求
   */
  async request<T = unknown>(config: RequestConfig): Promise<ResponseData<T>> {
    const iface = this.ensureInitialized();

    try {
      const response = await iface.request(config);

      return {
        data: response.data as T,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      };
    } catch (error) {
      if (error instanceof RequestError) {
        throw error;
      }

      throw new RequestError(
        error instanceof Error ? error.message : 'External request failed',
        {
          isNetworkError: true,
          config,
        }
      );
    }
  }

  /**
   * 发送流式请求
   */
  async *stream(config: RequestConfig): AsyncIterableIterator<StreamChunk> {
    const iface = this.ensureInitialized();

    // 如果外部接口支持流式
    if (iface.stream) {
      yield* iface.stream(config);
      return;
    }

    // 否则退回到普通请求并模拟流式
    const response = await this.request<string>({
      ...config,
      responseType: 'text',
    });

    // 按行分割模拟流式
    const lines = response.data.split('\n');
    for (const line of lines) {
      yield { data: line + '\n', done: false };
    }
    yield { data: '', done: true };
  }
}

/**
 * 创建油猴适配器
 * 自动检测 GM_xmlhttpRequest 并包装
 */
export function createGMAdapter(): ExternalAdapter {
  return new ExternalAdapter({
    name: 'gm_xhr',
    getInterface: () => {
      // 检测油猴环境
      const unsafeWindow = (typeof window !== 'undefined' && (window as { unsafeWindow?: { GM_xmlhttpRequest?: GM_xmlhttpRequest } }).unsafeWindow);
      const gmXHR = unsafeWindow?.GM_xmlhttpRequest ||
        (typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : undefined);

      if (!gmXHR) {
        return null;
      }

      return {
        request: <T = unknown>(config: RequestConfig): Promise<ResponseData<T>> => {
          return new Promise((resolve, reject) => {
            const headers: Record<string, string> = {};

            gmXHR({
              method: config.method || 'GET',
              url: buildURL(config.url, config.params),
              headers: config.headers,
              data: config.body ? JSON.stringify(config.body) : undefined,
              timeout: config.timeout || 30000,
              responseType: config.responseType === 'arraybuffer' ? 'arraybuffer' : 'text',
              onload: (response) => {
                // 解析响应头
                const headerLines = response.responseHeaders.split('\n');
                for (const line of headerLines) {
                  const [key, ...valueParts] = line.split(':');
                  if (key && valueParts.length > 0) {
                    headers[key.trim().toLowerCase()] = valueParts.join(':').trim();
                  }
                }

                let data: unknown = response.responseText;
                if (config.responseType === 'json' && typeof data === 'string') {
                  try {
                    data = JSON.parse(data);
                  } catch {
                    // 保持原样
                  }
                }

                resolve({
                  data: data as T,
                  status: response.status,
                  statusText: response.statusText,
                  headers,
                });
              },
              onerror: (error) => {
                reject(new RequestError('GM request failed', {
                  isNetworkError: true,
                  response: error,
                }));
              },
              ontimeout: () => {
                reject(new RequestError('GM request timeout', {
                  isTimeout: true,
                }));
              },
            });
          });
        },

        stream: async function* (config: RequestConfig): AsyncIterableIterator<StreamChunk> {
          const controller = { aborted: false };
          
          // 如果支持 signal
          config.signal?.addEventListener('abort', () => {
            controller.aborted = true;
          });

          const xhr = gmXHR({
            method: config.method || 'POST',
            url: buildURL(config.url, config.params),
            headers: {
              'Accept': 'text/event-stream',
              ...config.headers,
            },
            data: config.body ? JSON.stringify(config.body) : undefined,
            timeout: config.timeout || 30000,
            responseType: 'text',
            onreadystatechange: (response) => {
              // 可以在这里实现真正的流式
              // 但目前 GM_xmlhttpRequest 不支持真正的流式响应
              if (controller.aborted) {
                xhr.abort();
              }
            },
            onload: () => {
              // 请求完成
            },
          });

          // GM_xmlhttpRequest 不支持真正的流式，所以等待完成后返回
          // 这是一个简化的实现
          const response = await new Promise<ResponseData<string>>((resolve, reject) => {
            gmXHR({
              method: config.method || 'POST',
              url: buildURL(config.url, config.params),
              headers: {
                'Accept': 'text/event-stream',
                ...config.headers,
              },
              data: config.body ? JSON.stringify(config.body) : undefined,
              timeout: config.timeout || 30000,
              responseType: 'text',
              onload: (res) => {
                const headers: Record<string, string> = {};
                const headerLines = res.responseHeaders.split('\n');
                for (const line of headerLines) {
                  const [key, ...valueParts] = line.split(':');
                  if (key && valueParts.length > 0) {
                    headers[key.trim().toLowerCase()] = valueParts.join(':').trim();
                  }
                }
                resolve({
                  data: res.responseText,
                  status: res.status,
                  statusText: res.statusText,
                  headers,
                });
              },
              onerror: reject,
              ontimeout: () => reject(new Error('Timeout')),
            });
          });

          // 模拟流式
          const lines = response.data.split('\n');
          for (const line of lines) {
            if (controller.aborted) return;
            yield { data: line + '\n', done: false };
          }
          yield { data: '', done: true };
        },
      };
    },
  });
}

/**
 * 创建 Chrome 插件适配器
 */
export function createChromeAdapter(extensionId?: string): ExternalAdapter {
  return new ExternalAdapter({
    name: 'chrome_extension',
    getInterface: () => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        return null;
      }

      const sendMessage = extensionId
        ? (msg: unknown, cb: (response: unknown) => void) => chrome.runtime.sendMessage(extensionId, msg, cb)
        : (msg: unknown, cb: (response: unknown) => void) => chrome.runtime.sendMessage(msg, cb);

      return {
        request: <T = unknown>(config: RequestConfig): Promise<ResponseData<T>> => {
          return new Promise((resolve, reject) => {
            sendMessage(
              {
                type: 'request',
                config,
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  reject(new RequestError(chrome.runtime.lastError.message, {
                    isNetworkError: true,
                  }));
                  return;
                }

                const res = response as {
                  success: boolean;
                  data?: unknown;
                  status?: number;
                  statusText?: string;
                  headers?: Record<string, string>;
                  error?: string;
                };

                if (!res || !res.success) {
                  reject(new RequestError(res?.error || 'Chrome extension request failed', {
                    isNetworkError: true,
                    response: res,
                  }));
                  return;
                }

                resolve({
                  data: res.data as T,
                  status: res.status || 200,
                  statusText: res.statusText || 'OK',
                  headers: res.headers || {},
                });
              }
            );
          });
        },
      };
    },
  });
}

/**
 * 构建完整 URL
 */
function buildURL(url: string, params?: Record<string, unknown>): string {
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
 * 自动检测并创建最佳外部适配器
 */
export function createAutoExternalAdapter(): ExternalAdapter | null {
  // 优先尝试油猴
  if (typeof GM_xmlhttpRequest !== 'undefined' ||
      (typeof window !== 'undefined' && (window as { unsafeWindow?: { GM_xmlhttpRequest?: unknown } }).unsafeWindow?.GM_xmlhttpRequest)) {
    return createGMAdapter();
  }

  // 然后尝试 Chrome 插件
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    return createChromeAdapter();
  }

  return null;
}
