/**
 * Requests Module
 * 通用请求模块 - 支持多种适配器
 * 
 * @example
 * ```typescript
 * import { 
 *   RequestManager, 
 *   FetchAdapter,
 *   createGMAdapter,
 *   createAutoExternalAdapter 
 * } from './requests';
 * 
 * const manager = new RequestManager();
 * 
 * // 尝试注册外部适配器（油猴/Chrome插件）以绕过 CORS
 * const externalAdapter = createAutoExternalAdapter();
 * if (externalAdapter) {
 *   manager.register(externalAdapter);
 *   manager.setDefault('gm_xhr'); // 使用油猴请求
 * }
 * 
 * // 发送请求
 * const response = await manager.get('https://api.example.com/data');
 * 
 * // 流式请求
 * for await (const chunk of manager.stream({
 *   url: 'https://api.example.com/stream',
 *   method: 'POST'
 * })) {
 *   console.log(chunk.data);
 * }
 * ```
 */

// 类型
export type {
  IRequestAdapter,
  RequestConfig,
  ResponseData,
  StreamChunk,
  RequestError,
  ExternalRequestInterface,
  ExternalAdapterConfig,
  RequestInterceptor,
  RetryConfig,
  RequestManagerConfig,
  HttpMethod,
} from './types';

// 基础
export { RequestError } from './types';

// 适配器
export { FetchAdapter } from './adapters/fetch';
export { AxiosAdapter } from './adapters/axios';
export {
  ExternalAdapter,
  createGMAdapter,
  createChromeAdapter,
  createAutoExternalAdapter,
  type GM_xmlhttpRequest,
  type ChromeExtensionInterface,
} from './adapters/external';

// 管理器
export {
  RequestManager,
  createRequestManager,
  getGlobalRequestManager,
  setGlobalRequestManager,
} from './manager';
