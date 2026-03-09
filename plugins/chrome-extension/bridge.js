/**
 * Chrome Extension - Bridge Script
 * 注入到页面的脚本，提供请求接口
 */

(function () {
  'use strict';

  // 检查是否已经存在
  if (window.__AI_FRAMEWORK_REQUEST_BRIDGE__) {
    return;
  }

  let requestId = 0;

  /**
   * 发送请求
   */
  function request(config) {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      
      const timer = setTimeout(() => {
        window.removeEventListener('message', handleMessage);
        reject(new Error('Request timeout'));
      }, config.timeout || 30000);

      const handleMessage = (event) => {
        if (event.source !== window) return;
        if (event.data?.type !== 'REQUEST_BRIDGE_RESPONSE') return;
        if (event.data?.id !== id) return;

        clearTimeout(timer);
        window.removeEventListener('message', handleMessage);

        const response = event.data.data;
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error || 'Request failed'));
        }
      };

      window.addEventListener('message', handleMessage);

      // 发送请求到 content script
      window.postMessage({
        type: 'REQUEST_BRIDGE',
        id,
        config,
        stream: false,
      }, '*');
    });

  /**
   * 流式请求
   */
  async function* stream(config) {
    const id = ++requestId;
    const chunks = [];
    let resolver = null;
    let error = null;
    let ended = false;

    const handleMessage = (event) => {
      if (event.source !== window) return;

      const { type, data: msgData } = event.data || {};

      if (type === 'REQUEST_BRIDGE_STREAM_CHUNK' && event.data?.id === id) {
        chunks.push(msgData);
        if (resolver) {
          resolver();
          resolver = null;
        }
        if (msgData.done) {
          ended = true;
        }
      } else if (type === 'REQUEST_BRIDGE_STREAM_ERROR' && event.data?.id === id) {
        error = new Error(event.data.error);
        ended = true;
        if (resolver) {
          resolver();
          resolver = null;
        }
      } else if (type === 'REQUEST_BRIDGE_STREAM_END' && event.data?.id === id) {
        ended = true;
        if (resolver) {
          resolver();
          resolver = null;
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // 发送流式请求
    window.postMessage({
      type: 'REQUEST_BRIDGE',
      id,
      config,
      stream: true,
    }, '*');

    try {
      while (!ended || chunks.length > 0) {
        if (chunks.length === 0) {
          await new Promise((resolve) => {
            resolver = resolve;
          });
        }

        if (error) {
          throw error;
        }

        const chunk = chunks.shift();
        if (chunk) {
          yield chunk;
          if (chunk.done) {
            return;
          }
        }
      }
    } finally {
      window.removeEventListener('message', handleMessage);
    }
  }

  // 创建并暴露接口
  window.__AI_FRAMEWORK_REQUEST_BRIDGE__ = {
    request,
    stream,
  };

  console.log('[AI Framework Request Bridge] Bridge ready (Chrome Extension)');
})();
