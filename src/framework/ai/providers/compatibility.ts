/**
 * OpenAI Compatible Provider
 * 通用 OpenAI API 兼容 Provider
 * 
 * 支持所有 OpenAI API 兼容的服务商，包括但不限于：
 * - OpenAI, Anthropic, Google Gemini, Azure OpenAI
 * - Groq, Cerebras, Mistral, Together
 * - 智谱 AI, DeepSeek, 字节火山, 腾讯混元, 百度千帆, 阿里通义
 * - OpenRouter, Silicon Flow, AI21, Cohere
 * - 以及任何其他 OpenAI API 兼容的服务
 * 
 * @example
 * ```typescript
 * // 创建任意 OpenAI 兼容 Provider
 * const provider = createProvider({
 *   name: 'deepseek',
 *   apiKey: 'your-api-key',
 *   baseUrl: 'https://api.deepseek.com/v1',
 *   model: 'deepseek-chat'
 * });
 * 
 * // 使用
 * const response = await provider.request({
 *   messages: [{ role: 'user', content: 'Hello' }]
 * });
 * ```
 */

import { BaseProvider, type ProviderRequest, type ProviderStorageItem, type ThinkingArgs } from './index';
import type { AIResponse, AIStreamChunk } from '../../types';
import {
  sendAIRequest,
  aiStreamGenerator,
} from '../ai-request';
import { RequestError } from '../ai-request';

/**
 * OpenAI 兼容 Provider 配置
 */
export interface OpenAICompatibleConfig extends ProviderStorageItem {
  /** Organization ID (OpenAI/Azure 特定) */
  organization?: string;
  /** Project ID (OpenAI 特定) */
  project?: string;
  /** 自定义请求头 */
  headers?: Record<string, string>;
}

/**
 * 通用 OpenAI 兼容 Provider
 * 
 * 支持任何遵循 OpenAI API 格式的服务商
 */
export class OpenAICompatibleProvider extends BaseProvider {
  readonly name: string;
  readonly version = '2.0.0';
  readonly type: string;

  protected baseUrl: string;
  protected organization?: string;
  protected project?: string;
  protected customHeaders: Record<string, string>;

  constructor(config: OpenAICompatibleConfig) {
    super(config);
    this.name = config.name;
    this.type = config.type || 'openai-compatible';
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.organization = config.organization;
    this.project = config.project;
    this.customHeaders = config.headers || {};
  }

  /**
   * 构建请求头
   * 支持自定义 header 覆盖
   */
  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      ...this.customHeaders,
    };

    // OpenAI 特定的 Organization 和 Project
    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }
    if (this.project) {
      headers['OpenAI-Project'] = this.project;
    }

    return headers;
  }

  /**
   * 构建请求体
   * 标准的 OpenAI chat.completions 格式
   */
  protected buildRequestBody(req: ProviderRequest): unknown {
    const messages: unknown[] = [];
    let systemPromptAdded = false;

    // 处理 thinking 提示词
    const thinkingPrompt = req.thinkingPrompt || this.thinkingPrompt;
    const thinkingArgs = req.thinkingArgs || this.thinkingArgs;

    if (thinkingPrompt && thinkingArgs && thinkingArgs.type !== 'disabled') {
      messages.push({
        role: 'system',
        content: thinkingPrompt,
      });
      systemPromptAdded = true;
    }

    // 添加消息
    if (req.messages) {
      for (const m of req.messages) {
        if (systemPromptAdded && m.role === 'system') continue;

        messages.push({
          role: m.role,
          content: m.content,
          ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
          ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
          ...(m.name ? { name: m.name } : {}),
        });
      }
    } else if (req.prompt) {
      messages.push({ role: 'user', content: req.prompt });
    }

    // 基础请求体 (OpenAI 标准格式)
    const body: Record<string, unknown> = {
      model: req.model || this.config.model,
      messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens,
      top_p: req.topP,
      stream: req.stream ?? false,
    };

    // 可选参数
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools;
    }
    if (req.toolChoice) {
      body.tool_choice = req.toolChoice;
    }

    // 展开 thinking 参数 (如 DeepSeek 的 reasoning_effort)
    if (thinkingArgs) {
      Object.assign(body, thinkingArgs);
    }

    // 其他自定义参数
    for (const [key, value] of Object.entries(req)) {
      if (!['prompt', 'messages', 'stream', 'temperature', 'maxTokens', 'topP', 'tools', 'toolChoice', 'model', 'thinkingArgs', 'thinkingPrompt'].includes(key)) {
        body[key] = value;
      }
    }

    return body;
  }

  /**
   * 发送普通请求
   */
  async request(req: ProviderRequest): Promise<AIResponse> {
    const body = this.buildRequestBody(req);
    const headers = this.buildHeaders();

    try {
      const response = await sendAIRequest<unknown>({
        url: `${this.baseUrl}/chat/completions`,
        method: 'POST',
        headers,
        body,
        timeout: this.config.timeout,
      });

      // 解析 OpenAI 格式响应
      const data = response.data as Record<string, unknown>;
      const choices = data.choices as Array<Record<string, unknown>> | undefined;

      if (!choices || choices.length === 0) {
        return { content: '' };
      }

      const choice = choices[0];
      const message = choice.message as Record<string, unknown> | undefined;

      // 处理 reasoning_content (DeepSeek 等)
      const content = String(message?.content || '');
      const thinking = (message as Record<string, unknown>)?.reasoning_content as string | undefined;

      return {
        content,
        thinking,
        usage: data.usage as AIResponse['usage'],
        model: String(data.model || ''),
        finishReason: String(choice.finish_reason || ''),
      };
    } catch (error) {
      if (error instanceof RequestError) {
        throw error;
      }
      throw new RequestError(`${this.name} request failed: ${error}`);
    }
  }

  /**
   * 流式请求
   */
  async *stream(req: ProviderRequest): AsyncIterableIterator<AIStreamChunk> {
    const body = Object.assign({}, this.buildRequestBody(req), { stream: true });
    const headers = this.buildHeaders();

    const generator = aiStreamGenerator({
      url: `${this.baseUrl}/chat/completions`,
      method: 'POST',
      headers,
      body,
      timeout: this.config.timeout,
    });

    for await (const chunk of generator) {
      yield chunk;
    }
  }

  /**
   * 检查服务可用性
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await sendAIRequest<unknown>({
        url: `${this.baseUrl}/models`,
        method: 'GET',
        headers: this.buildHeaders(),
        timeout: 10000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * 获取模型列表
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await sendAIRequest<{ data: { id: string }[] }>({
        url: `${this.baseUrl}/models`,
        method: 'GET',
        headers: this.buildHeaders(),
        timeout: this.config.timeout,
      });

      return response.data.data.map((m) => m.id);
    } catch {
      return [];
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): Partial<OpenAICompatibleConfig> {
    return {
      name: this.config.name,
      type: this.config.type,
      baseUrl: this.baseUrl,
      model: this.config.model,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      organization: this.organization,
      project: this.project,
      headers: this.customHeaders,
      thinkingArgs: this.getThinkingArgs(),
      thinkingPrompt: this.getThinkingPrompt(),
    };
  }
}

/**
 * 创建 OpenAI 兼容 Provider
 * 
 * 通用工厂函数，支持任何 OpenAI API 兼容的服务商
 * 
 * @param config Provider 配置
 * @returns OpenAICompatibleProvider 实例
 * 
 * @example
 * ```typescript
 * // OpenAI
 * const openai = createProvider({
 *   name: 'openai',
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: 'gpt-4o'
 * });
 * 
 * // DeepSeek
 * const deepseek = createProvider({
 *   name: 'deepseek',
 *   apiKey: process.env.DEEPSEEK_API_KEY,
 *   baseUrl: 'https://api.deepseek.com/v1',
 *   model: 'deepseek-chat'
 * });
 * 
 * // 智谱 AI
 * const zhipu = createProvider({
 *   name: 'zhipu',
 *   apiKey: process.env.ZHIPU_API_KEY,
 *   baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
 *   model: 'glm-4'
 * });
 * 
 * // 腾讯混元
 * const hunyuan = createProvider({
 *   name: 'hunyuan',
 *   apiKey: process.env.HUNYUAN_API_KEY,
 *   baseUrl: 'https://hunyuan.tencentcloudapi.com/v1',
 *   model: 'hunyuan-pro',
 *   headers: {
 *     'X-TC-Region': 'ap-guangzhou'
 *   }
 * });
 * 
 * // 使用
 * const response = await deepseek.request({
 *   messages: [{ role: 'user', content: 'Hello' }]
 * });
 * ```
 */
export function createProvider(config: {
  /** Provider 名称（用于标识） */
  name: string;
  /** API 密钥 */
  apiKey: string;
  /** 基础 URL（默认为 OpenAI） */
  baseUrl?: string;
  /** 默认模型 */
  model?: string;
  /** Organization ID */
  organization?: string;
  /** Project ID */
  project?: string;
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** Thinking 参数 */
  thinkingArgs?: ThinkingArgs;
  /** Thinking 提示词 */
  thinkingPrompt?: string;
}): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider({
    name: config.name,
    type: 'openai-compatible',
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    organization: config.organization,
    project: config.project,
    headers: config.headers,
    timeout: config.timeout ?? 60000,
    maxRetries: config.maxRetries ?? 3,
    thinkingArgs: config.thinkingArgs,
    thinkingPrompt: config.thinkingPrompt,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

/**
 * 快速创建 OpenAI Provider
 * 
 * @param apiKey OpenAI API Key
 * @param options 可选配置
 * 
 * @example
 * ```typescript
 * const openai = createOpenAI(process.env.OPENAI_API_KEY, {
 *   model: 'gpt-4o',
 *   organization: 'org-xxx'
 * });
 * ```
 */
export function createOpenAI(
  apiKey: string,
  options?: {
    model?: string;
    organization?: string;
    project?: string;
  }
): OpenAICompatibleProvider {
  return createProvider({
    name: 'openai',
    apiKey,
    baseUrl: 'https://api.openai.com/v1',
    model: options?.model ?? 'gpt-4o',
    organization: options?.organization,
    project: options?.project,
  });
}

// 注册到工厂
import { providerFactory } from './index';
providerFactory.register('openai-compatible', OpenAICompatibleProvider);
providerFactory.register('openai', OpenAICompatibleProvider);