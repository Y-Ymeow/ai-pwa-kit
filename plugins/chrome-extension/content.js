/**
 * Chrome Extension - Content Script
 * 注入桥接脚本到页面
 */

// 注入 bridge.js 到页面
const script = document.createElement('script');
script.src = chrome.runtime.getURL('bridge.js');
script.onload = function() {
  this.remove();
};
(document.head || document.documentElement).appendChild(script);

// 监听来自页面的消息并转发到 background
window.addEventListener('message', async (event) => {
  // 只处理来自页面的消息
  if (event.source !== window || !event.data) {
    return;
  }

  const { type, id, config, stream } = event.data;

  if (type !== 'REQUEST_BRIDGE') {
    return;
  }

  try {
    if (stream) {
      // 流式请求使用 Port
      const port = chrome.runtime.connect({ name: 'stream-request' });
      
      port.postMessage({
        type: 'stream',
        config,
      });

      port.onMessage.addListener((message) => {
        if (message.type === 'chunk') {
          window.postMessage({
            type: 'REQUEST_BRIDGE_STREAM_CHUNK',
            id,
            data: message.data,
          }, '*');
        } else if (message.type === 'error') {
          window.postMessage({
            type: 'REQUEST_BRIDGE_STREAM_ERROR',
            id,
            error: message.error,
          }, '*');
          port.disconnect();
        }
      });

      port.onDisconnect.addListener(() => {
        window.postMessage({
          type: 'REQUEST_BRIDGE_STREAM_END',
          id,
        }, '*');
      });
    } else {
      // 普通请求
      const response = await chrome.runtime.sendMessage({
        type: 'request',
        config,
        stream: false,
      });

      window.postMessage({
        type: 'REQUEST_BRIDGE_RESPONSE',
        id,
        data: response,
      }, '*');
    }
  } catch (error) {
    window.postMessage({
      type: 'REQUEST_BRIDGE_RESPONSE',
      id,
      data: {
        success: false,
        error: error.message,
      },
    }, '*');
  }
});

console.log('[AI Framework Request Bridge] Content script loaded');
