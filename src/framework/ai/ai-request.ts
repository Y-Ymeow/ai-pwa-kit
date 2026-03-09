/**
 * AI Request Module
 * 基于通用 requests 模块的 AI 专用请求封装
 *
 * 提供 AI 特定的功能：
 * - OpenAI/Claude 流式响应解析
 * - SSE 数据解析
 * - Tool Call 解析
 * - 自动重试机制
 */

import {
  RequestManager,
  RequestError,
  createAutoExternalAdapter,
} from '../requests';

import type {
  RequestConfig,
  ResponseData,
} from '../requests';

import type { AIResponse, AIStreamChunk } from '../types';

export { RequestError };

/**
 * AI 请求配置
 */
export interface AIRequestConfig extends RequestConfig {
  /** 是否流式请求 */
  stream?: boolean;
  /** 流式回调 */
  onChunk?: (chunk: AIStreamChunk) => void;
}

/**
 * 解析 OpenAI 格式的流式数据块
 */
export function parseOpenAIStreamChunk(data: unknown): AIStreamChunk & { model?: string; finishReason?: string } {
  const d = data as Record<string, unknown>;
  const choices = d.choices as Array<Record<string, unknown>> | undefined;

  if (!choices || choices.length === 0) {
    return { done: false };
  }

  const choice = choices[0];
  const delta = choice?.delta as Record<string, unknown> | undefined;
  const finishReason = choice?.finish_reason as string | undefined;

  // OpenAI 格式
  const content = delta?.content as string | undefined;
  const thinking = (delta as Record<string, unknown>)?.reasoning_content as string | undefined;

  // 工具调用
  const toolCalls = delta?.tool_calls as Array<Record<string, unknown>> | undefined;
  let tools: Array<{ id: string; name: string; arguments: Record<string, unknown> }> | undefined;

  if (toolCalls && toolCalls.length > 0) {
    tools = toolCalls.map((tc) => {
      const func = tc.function as Record<string, unknown> | undefined;
      return {
        id: String(tc.id || ''),
        name: String(func?.name || ''),
        arguments: (() => {
          try {
            return JSON.parse(String(func?.arguments || '{}'));
          } catch {
            return {};
          }
        })(),
      };
    });
  }

  // 使用信息
  const usage = d.usage as { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
  const model = d.model as string | undefined;

  return {
    content: content || undefined,
    thinking: thinking || undefined,
    done: finishReason === 'stop' || finishReason === 'length',
    tools,
    tool: tools?.[0],
    usage,
    model,
    finishReason: finishReason || undefined,
  };
}

/**
 * 解析 SSE 流数据
 */
export function parseSSEChunk(line: string): Record<string, unknown> | null {
  if (!line.trim() || line.startsWith(':')) return null;
  
  if (line.startsWith('data: ')) {
    const dataStr = line.slice(6).trim();
    if (dataStr === '[DONE]') return { done: true };
    
    try {
      return JSON.parse(dataStr);
    } catch {
      return null;
    }
  }
  
  return null;
}

/**
 * AI 流式生成器
 */
export async function* aiStreamGenerator(
  config: AIRequestConfig
): AsyncGenerator<AIStreamChunk, AIResponse, unknown> {
  const { url, headers = {}, body, timeout = 60000, onChunk } = config;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const contentParts: string[] = [];
  const thinkingParts: string[] = [];
  let finalTool: { id: string; name: string; arguments: Record<string, unknown> } | undefined;
  let finalTools: Array<{ id: string; name: string; arguments: Record<string, unknown> }> | undefined;
  let finalUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
  let finalModel: string | undefined;
  let finalFinishReason: string | undefined;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = (errorData && typeof errorData === 'object' && 'error' in errorData)
        ? String((errorData as Record<string, unknown>).error)
        : `HTTP ${response.status}`;
      throw new RequestError(errorMessage, { status: response.status, response: errorData });
    }

    if (!response.body) {
      throw new RequestError('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        const data = parseSSEChunk(line);
        if (!data) continue;

        if (data.done) {
          const result: AIResponse = {
            content: contentParts.join(''),
            thinking: thinkingParts.length > 0 ? thinkingParts.join('') : undefined,
            tool: finalTool,
            tools: finalTools,
            usage: finalUsage,
            model: finalModel,
            finishReason: finalFinishReason,
          };
          yield { done: true, tool: finalTool, tools: finalTools, usage: finalUsage };
          return result;
        }

        const parsed = parseOpenAIStreamChunk(data);

        if (parsed.content) contentParts.push(parsed.content);
        if (parsed.thinking) thinkingParts.push(parsed.thinking);
        if (parsed.tool) finalTool = parsed.tool;
        if (parsed.tools) finalTools = parsed.tools;
        if (parsed.usage) finalUsage = parsed.usage;
        if (parsed.model) finalModel = parsed.model;
        if (parsed.finishReason) finalFinishReason = parsed.finishReason;

        if (onChunk) onChunk(parsed);
        yield parsed;
      }
    }

    return {
      content: contentParts.join(''),
      thinking: thinkingParts.length > 0 ? thinkingParts.join('') : undefined,
      tool: finalTool,
      tools: finalTools,
      usage: finalUsage,
      model: finalModel,
      finishReason: finalFinishReason,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 创建 AI 专用的请求管理器
 * 
 * 自动注册外部适配器（油猴/Chrome插件）以绕过 CORS
 */
export function createAIRequestManager(options?: {
  useExternalAdapter?: boolean;
  defaultAdapter?: string;
}): RequestManager {
  const manager = new RequestManager();

  // 尝试自动注册外部适配器
  if (options?.useExternalAdapter !== false) {
    const externalAdapter = createAutoExternalAdapter();
    if (externalAdapter) {
      manager.register(externalAdapter);
      if (options?.defaultAdapter) {
        manager.setDefault(options.defaultAdapter);
      }
    }
  }

  return manager;
}

/**
 * 发送 AI 请求
 */
export async function sendAIRequest<T = unknown>(
  config: AIRequestConfig
): Promise<ResponseData<T>> {
  const manager = createAIRequestManager();
  return manager.request<T>(config);
}

/**
 * 流式 AI 请求
 */
export async function streamAIRequest(
  config: AIRequestConfig
): Promise<AIResponse> {
  let finalResult: AIResponse = { content: '' };

  for await (const chunk of aiStreamGenerator(config)) {
    if (chunk.done && chunk !== finalResult) {
      // 获取最终结果
      finalResult = {
        content: chunk.content || '',
        thinking: chunk.thinking,
        tool: chunk.tool,
        tools: chunk.tools,
        usage: chunk.usage,
      };
    }
  }

  return finalResult;
}

/**
 * 带重试的 AI 请求
 */
export async function sendAIRequestWithRetry<T = unknown>(
  config: AIRequestConfig,
  retries = 3
): Promise<ResponseData<T>> {
  const manager = createAIRequestManager();
  return manager.request<T>(config, { retry: { maxRetries: retries } });
}

// 重导出 requests 模块的常用功能
export {
  RequestManager,
  FetchAdapter,
  createAutoExternalAdapter,
} from '../requests';

export type {
  RequestConfig,
  ResponseData,
  StreamChunk,
} from '../requests';
