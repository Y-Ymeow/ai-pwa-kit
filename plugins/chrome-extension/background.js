/**
 * Chrome Extension - Background Service Worker
 * 处理来自内容脚本的请求
 */

// 配置
const CONFIG = {
  // 默认超时时间
  defaultTimeout: 30000,
  // 请求大小限制
  maxRequestSize: 10 * 1024 * 1024, // 10MB
  // 响应大小限制
  maxResponseSize: 50 * 1024 * 1024, // 50MB
};

/**
 * 发送 HTTP 请求
 */
async function sendRequest(config) {
  const { url, method = 'GET', headers = {}, body, timeout = CONFIG.defaultTimeout } = config;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? (typeof body === 'object' ? JSON.stringify(body) : body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      success: true,
      data,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timeout',
      };
    }

    return {
      success: false,
      error: error.message || 'Network error',
    };
  }
}

/**
 * 发送流式请求
 */
async function* sendStreamRequest(config) {
  const { url, method = 'POST', headers = {}, body, timeout = CONFIG.defaultTimeout } = config;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Accept': 'text/event-stream',
        ...headers,
      },
      body: body ? (typeof body === 'object' ? JSON.stringify(body) : body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
    throw error;
  }
}

/**
 * 处理来自内容脚本的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'request') {
    return false;
  }

  const { config, stream = false } = message;

  if (stream) {
    // 流式请求需要使用 Port 连接
    // 这里先返回不支持
    sendResponse({
      success: false,
      error: 'Streaming via message is not supported. Use port connection.',
    });
    return false;
  }

  // 非流式请求
  sendRequest(config).then(sendResponse);
  
  // 返回 true 表示会异步发送响应
  return true;
});

/**
 * 处理长连接（用于流式请求）
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'stream-request') {
    return;
  }

  port.onMessage.addListener(async (message) => {
    if (message.type !== 'stream') {
      return;
    }

    try {
      const generator = sendStreamRequest(message.config);
      
      for await (const chunk of generator) {
        port.postMessage({
          type: 'chunk',
          data: chunk,
        });
        
        if (chunk.done) {
          port.disconnect();
          return;
        }
      }
    } catch (error) {
      port.postMessage({
        type: 'error',
        error: error.message,
      });
      port.disconnect();
    }
  });
});

console.log('[AI Framework Request Bridge] Background service worker initialized');
