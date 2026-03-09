/**
 * OpenAI Provider Implementation
 * 支持标准 OpenAI API 和兼容 API
 */

import {
  BaseProvider,
  type ProviderRequest,
  type ProviderStorageItem,
  type ThinkingArgs,
} from "./index";
import type { AIResponse, AIStreamChunk } from "../../types";
import { parseOpenAIResponse } from "../parser";
import { buildOpenAIHeaders } from "../query_build";
import { createAIRequestManager, RequestError } from "../ai-request";

export interface OpenAIConfig extends ProviderStorageItem {
  /** Organization ID */
  organization?: string;
  /** Project ID */
  project?: string;
}

/**
 * OpenAI Provider
 */
export class OpenAIProvider extends BaseProvider {
  readonly name: string;
  readonly version = "1.0.0";
  readonly type = "openai";

  private baseUrl: string;
  private organization?: string;
  private project?: string;

  constructor(config: OpenAIConfig) {
    super(config);
    this.name = config.name;
    this.baseUrl = config.baseUrl || "https://api.openai.com/v1";
    this.organization = config.organization;
    this.project = config.project;
  }

  /**
   * 启用思考功能
   * OpenAI 原生不支持 thinking 参数，通过提示词模拟
   * @param args 可选的模型参数（某些兼容 API 可能支持）
   */
  enableThinking(args?: ThinkingArgs): void {
    super.enableThinking(args);
  }

  /**
   * 禁用思考功能
   * @param args 可选的禁用参数（某些兼容 API 可能支持 { type: "disabled" }）
   */
  disableThinking(args?: ThinkingArgs): void {
    super.disableThinking(args);
  }

  /**
   * 构建请求体（覆盖以处理 thinkingArgs 展开）
   */
  protected buildRequestBody(req: ProviderRequest): unknown {
    const messages: unknown[] = [];
    let systemPromptAdded = false;

    // 如果启用了 thinking（通过 thinkingPrompt 判断），添加系统提示词
    const thinkingPrompt = req.thinkingPrompt || this.thinkingPrompt;
    const thinkingArgs = req.thinkingArgs || this.thinkingArgs;

    if (thinkingPrompt && thinkingArgs && thinkingArgs.type !== "disabled") {
      messages.push({
        role: "system",
        content: thinkingPrompt,
      });
      systemPromptAdded = true;
    }

    if (req.messages) {
      for (const m of req.messages) {
        // 如果已经添加了 thinking 的 system prompt，跳过原始 system
        if (systemPromptAdded && m.role === "system") {
          continue;
        }

        messages.push({
          role: m.role,
          content: m.content,
          ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
          ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
          ...(m.name ? { name: m.name } : {}),
        });
      }
    } else if (req.prompt) {
      messages.push({ role: "user", content: req.prompt });
    }

    // 基础请求体
    const body: Record<string, unknown> = {
      model: req.model || this.config.model,
      messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens,
      top_p: req.topP,
      stream: req.stream ?? false,
    };

    // 添加工具定义
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools;
    }

    // 添加 tool_choice（如果指定）
    if (req.toolChoice) {
      body.tool_choice = req.toolChoice;
    }

    // 展开 thinking 参数（请求级优先）
    // 例如 DeepSeek: { type: 'enabled', max_tokens: 8192 }
    // 例如禁用: { type: 'disabled' }
    if (thinkingArgs) {
      Object.assign(body, thinkingArgs);
    }

    return body;
  }

  /**
   * 构建请求头
   */
  private buildHeaders(): Record<string, string> {
    return buildOpenAIHeaders({
      apiKey: this.config.apiKey,
      headers: this.config.headers,
      organization: this.organization,
      project: this.project,
    });
  }

  /**
   * 发送普通请求
   */
  async request(req: ProviderRequest): Promise<AIResponse> {
    const body = this.buildRequestBody(req);
    const headers = this.buildHeaders();

    try {
      const manager = createAIRequestManager();
      const response = await manager.request<unknown>({
        url: `${this.baseUrl}/chat/completions`,
        method: "POST",
        headers,
        body,
        timeout: this.config.timeout,
      });

      return parseOpenAIResponse(response.data as Record<string, unknown>);
    } catch (error) {
      if (error instanceof RequestError) {
        throw error;
      }
      throw new RequestError(`OpenAI request failed: ${error}`);
    }
  }

  /**
   * 流式请求
   */
  async *stream(req: ProviderRequest): AsyncIterableIterator<AIStreamChunk> {
    const body = Object.assign({}, this.buildRequestBody(req), {
      stream: true,
    });
    const headers = this.buildHeaders();

    const manager = createAIRequestManager();

    for await (const chunk of manager.stream({
      url: `${this.baseUrl}/chat/completions`,
      method: "POST",
      headers,
      body,
      timeout: this.config.timeout,
    })) {
      yield chunk as AIStreamChunk;
    }
  }

  /**
   * 检查服务可用性
   */
  async healthCheck(): Promise<boolean> {
    try {
      const manager = createAIRequestManager();
      const response = await manager.request<unknown>({
        url: `${this.baseUrl}/models`,
        method: "GET",
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
      const manager = createAIRequestManager();
      const response = await manager.request<{ data: { id: string }[] }>({
        url: `${this.baseUrl}/models`,
        method: "GET",
        headers: this.buildHeaders(),
        timeout: this.config.timeout,
      });

      return response.data.data
        .filter((m) => m.id.includes("gpt"))
        .map((m) => m.id);
    } catch (error) {
      throw new RequestError(`Failed to list models: ${error}`);
    }
  }
}

/**
 * 注册到工厂
 */
import { providerFactory } from "./index";
providerFactory.register("openai", OpenAIProvider);
