// ==UserScript==
// @name         AI Framework Request Bridge
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  为 AI Framework 提供跨域请求支持，绕过浏览器 CORS 限制
// @author       You
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// ==/UserScript==

/**
 * AI Framework Request Bridge
 * 
 * 此油猴脚本为 AI Dev Framework 提供跨域请求能力。
 * 它通过 GM_xmlhttpRequest 绕过浏览器的 CORS 限制，
 * 并将请求接口暴露给页面脚本使用。
 * 
 * 使用方法：
 * 1. 安装此油猴脚本
 * 2. 在框架中创建外部适配器：
 *    const adapter = createAutoExternalAdapter();
 *    if (adapter) {
 *      manager.register(adapter);
 *      manager.setDefault('gm_xhr');
 *    }
 */

(function () {
  'use strict';

  // 配置
  const CONFIG = {
    // 是否在控制台输出日志
    debug: true,
    // 请求超时时间（毫秒）
    defaultTimeout: 30000,
    // 允许的目标域名（* 表示全部）
    allowedDomains: GM_getValue('allowedDomains', ['*']),
    // 请求大小限制（字节）
    maxRequestSize: 10 * 1024 * 1024, // 10MB
    // 响应大小限制（字节）
    maxResponseSize: 50 * 1024 * 1024, // 50MB
  };

  // 日志工具
  const logger = {
    log: (...args) => CONFIG.debug && console.log('[RequestBridge]', ...args),
    error: (...args) => CONFIG.debug && console.error('[RequestBridge]', ...args),
    warn: (...args) => CONFIG.debug && console.warn('[RequestBridge]', ...args),
  };

  logger.log('Request Bridge initialized');

  /**
   * 检查 URL 是否允许
   */
  function isAllowedURL(url) {
    if (CONFIG.allowedDomains.includes('*')) return true;
    
    try {
      const urlObj = new URL(url);
      return CONFIG.allowedDomains.some(domain => {
        if (domain === '*') return true;
        if (domain.startsWith('*.')) {
          return urlObj.hostname.endsWith(domain.slice(2));
        }
        return urlObj.hostname === domain;
      });
    } catch {
      return false;
    }
  }

  /**
   * 将请求体序列化为字符串
   */
  function serializeBody(body) {
    if (body === null || body === undefined) return undefined;
    if (typeof body === 'string') return body;
    return JSON.stringify(body);
  }

  /**
   * 解析响应头字符串为对象
   */
  function parseResponseHeaders(headerStr) {
    const headers = {};
    if (!headerStr) return headers;
    
    const lines = headerStr.split('\n');
    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        headers[key.trim().toLowerCase()] = valueParts.join(':').trim();
      }
    }
    return headers;
  }

  /**
   * 发送请求
   */
  function sendRequest(config) {
    return new Promise((resolve, reject) => {
      const { url, method = 'GET', headers = {}, body, timeout = CONFIG.defaultTimeout } = config;

      logger.log('Sending request:', method, url);

      // 检查 URL 是否允许
      if (!isAllowedURL(url)) {
        reject(new Error(`Domain not allowed: ${url}`));
        return;
      }

      // 检查请求体大小
      const serializedBody = serializeBody(body);
      if (serializedBody && serializedBody.length > CONFIG.maxRequestSize) {
        reject(new Error('Request body too large'));
        return;
      }

      const startTime = Date.now();

      GM_xmlhttpRequest({
        method,
        url,
        headers,
        data: serializedBody,
        timeout,
        responseType: 'text',
        
        onload: (response) => {
          const duration = Date.now() - startTime;
          logger.log(`Request completed in ${duration}ms:`, response.status, url);

          // 检查响应大小
          if (response.responseText && response.responseText.length > CONFIG.maxResponseSize) {
            reject(new Error('Response too large'));
            return;
          }

          resolve({
            success: true,
            data: response.responseText,
            status: response.status,
            statusText: response.statusText,
            headers: parseResponseHeaders(response.responseHeaders),
          });
        },

        onerror: (error) => {
          logger.error('Request failed:', url, error);
          reject({
            success: false,
            error: 'Network error',
            details: error,
          });
        },

        ontimeout: () => {
          logger.error('Request timeout:', url);
          reject({
            success: false,
            error: 'Timeout',
          });
        },

        onabort: () => {
          logger.log('Request aborted:', url);
          reject({
            success: false,
            error: 'Aborted',
          });
        },
      });
    });
  }

  /**
   * 发送流式请求（SSE）
   */
  async function* sendStreamRequest(config) {
    const { url, method = 'POST', headers = {}, body, timeout = CONFIG.defaultTimeout } = config;

    logger.log('Starting stream request:', method, url);

    if (!isAllowedURL(url)) {
      throw new Error(`Domain not allowed: ${url}`);
    }

    const serializedBody = serializeBody(body);
    const controller = { aborted: false };

    // 检查是否支持中止
    if (config.signal) {
      config.signal.addEventListener('abort', () => {
        controller.aborted = true;
      });
    }

    // 由于 GM_xmlhttpRequest 不支持真正的流式，
    // 我们使用轮询方式模拟（或等待完整响应后分段返回）
    const response = await new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers: {
          'Accept': 'text/event-stream',
          ...headers,
        },
        data: serializedBody,
        timeout,
        responseType: 'text',
        
        onload: resolve,
        onerror: reject,
        ontimeout: () => reject(new Error('Timeout')),
      });
    });

    // 模拟流式输出
    const lines = response.responseText.split('\n');
    const chunkSize = 10; // 每批发送 10 行

    for (let i = 0; i < lines.length; i += chunkSize) {
      if (controller.aborted) {
        logger.log('Stream aborted');
        return;
      }

      const chunk = lines.slice(i, i + chunkSize).join('\n') + '\n';
      yield {
        data: chunk,
        done: false,
      };

      // 添加小延迟模拟流式效果
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    yield { data: '', done: true };
    logger.log('Stream completed');
  }

  /**
   * 创建外部请求接口
   */
  function createExternalInterface() {
    return {
      request: sendRequest,
      stream: sendStreamRequest,
    };
  }

  /**
   * 将接口暴露给页面
   * 通过 CustomEvent 进行安全通信
   */
  function setupBridge() {
    // 监听来自页面的请求
    document.addEventListener('request-bridge-request', async (event) => {
      const { requestId, config } = event.detail;
      
      try {
        const result = await sendRequest(config);
        
        // 发送响应
        document.dispatchEvent(new CustomEvent(`request-bridge-response-${requestId}`, {
          detail: result,
        }));
      } catch (error) {
        document.dispatchEvent(new CustomEvent(`request-bridge-response-${requestId}`, {
          detail: {
            success: false,
            error: error.message || 'Unknown error',
          },
        }));
      }
    });

    // 监听流式请求
    document.addEventListener('request-bridge-stream', async (event) => {
      const { requestId, config } = event.detail;
      
      try {
        const generator = sendStreamRequest(config);
        
        for await (const chunk of generator) {
          // 发送每个块
          document.dispatchEvent(new CustomEvent(`request-bridge-stream-chunk-${requestId}`, {
            detail: chunk,
          }));
        }
      } catch (error) {
        document.dispatchEvent(new CustomEvent(`request-bridge-stream-error-${requestId}`, {
          detail: { error: error.message },
        }));
      }
    });

    // 将接口挂载到 unsafeWindow，供页面脚本直接访问
    if (typeof unsafeWindow !== 'undefined') {
      unsafeWindow.__AI_FRAMEWORK_REQUEST_BRIDGE__ = createExternalInterface();
      logger.log('Request bridge attached to window');
    }
  }

  /**
   * 设置菜单命令
   */
  function setupMenuCommands() {
    if (typeof GM_registerMenuCommand === 'undefined') return;

    GM_registerMenuCommand('🌐 添加允许的域名', () => {
      const domain = prompt('输入要允许的域名（如 api.openai.com）：');
      if (domain) {
        const domains = GM_getValue('allowedDomains', ['*']);
        if (!domains.includes(domain)) {
          domains.push(domain);
          GM_setValue('allowedDomains', domains);
          CONFIG.allowedDomains = domains;
          alert(`已添加: ${domain}`);
        }
      }
    });

    GM_registerMenuCommand('📋 查看允许的域名', () => {
      const domains = GM_getValue('allowedDomains', ['*']);
      alert(`允许的域名:\n${domains.join('\n')}`);
    });

    GM_registerMenuCommand('🔄 重置为允许所有', () => {
      if (confirm('确定要重置为允许所有域名吗？')) {
        GM_setValue('allowedDomains', ['*']);
        CONFIG.allowedDomains = ['*'];
        alert('已重置为允许所有域名');
      }
    });
  }

  // 初始化
  setupBridge();
  setupMenuCommands();

  logger.log('Request Bridge ready');
})();
