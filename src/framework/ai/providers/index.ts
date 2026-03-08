/**
 * Providers Module
 * AI Provider 定义和实现，包含数据存储机制
 */

import type { AIResponse, AIStreamChunk, AIMessage } from "../../types";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Thinking 参数配置
 * 使用对象形式，支持各种模型的不同格式
 * 例如:
 * - DeepSeek: { type: 'enabled', max_tokens: 8192 }
 * - Claude:   { type: 'enabled', budget_tokens: 16000 }
 * - 禁用:      { type: 'disabled' }
 */
export interface ThinkingArgs {
  [key: string]: unknown;
}

/**
 * Provider 配置存储项
 */
export interface ProviderStorageItem {
  /** Provider 名称 */
  name: string;
  /** Provider 类型（如 'openai', 'anthropic'） */
  type: string;
  /** API 密钥 */
  apiKey: string;
  /** 基础 URL（可选，用于自定义端点） */
  baseUrl?: string;
  /** 默认模型 */
  model?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 额外请求头 */
  headers?: Record<string, string>;
  /** 额外配置 */
  options?: Record<string, unknown>;
  /** Thinking 参数（直接展开到请求体） */
  thinkingArgs?: ThinkingArgs;
  /** Thinking 提示词（用于不支持原生 thinking 的模型） */
  thinkingPrompt?: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * Provider 请求参数
 */
export interface ProviderRequest {
  /** 简单提示（兼容旧方式） */
  prompt?: string;
  /** 消息数组（新方式，支持多轮对话） */
  messages?: AIMessage[];
  /** 是否流式输出 */
  stream?: boolean;
  /** 温度参数 */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
  /** Top P */
  topP?: number;
  /** 工具定义 */
  tools?: unknown[];
  /** 模型名称（覆盖默认） */
  model?: string;
  /** Thinking 参数（覆盖默认，直接展开到请求体） */
  thinkingArgs?: ThinkingArgs;
  /** Thinking 提示词 */
  thinkingPrompt?: string;
  /** 额外参数 */
  [key: string]: unknown;
}

/**
 * Provider 接口定义
 */
export interface Provider {
  readonly name: string;
  readonly version: string;
  readonly type: string;

  /**
   * 发送普通请求
   */
  request(req: ProviderRequest): Promise<AIResponse>;

  /**
   * 流式请求
   */
  stream?(req: ProviderRequest): AsyncIterableIterator<AIStreamChunk>;

  /**
   * 检查服务可用性
   */
  healthCheck?(): Promise<boolean>;

  /**
   * 获取模型列表
   */
  listModels?(): Promise<string[]>;

  /**
   * 获取当前配置
   */
  getConfig?(): Partial<ProviderStorageItem>;

  /**
   * 启用思考功能
   * @param args 模型特定的 thinking 参数，直接展开到请求体
   * @param thinkingPrompt 用于引导模型展示思考的提示词
   */
  enableThinking?(args?: ThinkingArgs, thinkingPrompt?: string): void;

  /**
   * 禁用思考功能
   * @param args 模型特定的禁用参数（如 { type: 'disabled' }）
   */
  disableThinking?(args?: ThinkingArgs): void;

  /**
   * 设置 thinking 参数
   */
  setThinkingArgs?(args: ThinkingArgs): void;

  /**
   * 获取当前 thinking 参数
   */
  getThinkingArgs?(): ThinkingArgs | undefined;

  /**
   * 设置 thinking 提示词
   */
  setThinkingPrompt?(prompt: string): void;

  /**
   * 获取 thinking 提示词
   */
  getThinkingPrompt?(): string | undefined;
}

/**
 * 基础 Provider 抽象类
 */
export abstract class BaseProvider implements Provider {
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly type: string;

  protected config: ProviderStorageItem;
  protected thinkingArgs: ThinkingArgs | undefined;
  protected thinkingPrompt: string | undefined;

  constructor(config: ProviderStorageItem) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      ...config,
    };
    // 初始化 thinking 配置
    this.thinkingArgs = config.thinkingArgs;
    this.thinkingPrompt = config.thinkingPrompt;
  }

  /**
   * 启用思考功能
   * @param args 模型特定的 thinking 参数，如 { type: 'enabled', max_tokens: 8192 }
   */
  enableThinking(args?: ThinkingArgs): void {
    this.thinkingArgs = args || { type: "enabled" };
  }

  /**
   * 禁用思考功能
   * @param args 模型特定的禁用参数，如 { type: 'disabled' }
   */
  disableThinking(args?: ThinkingArgs): void {
    this.thinkingArgs = args || { type: "disabled" };
  }

  /**
   * 设置 thinking 参数
   */
  setThinkingArgs(args: ThinkingArgs): void {
    this.thinkingArgs = args;
  }

  /**
   * 获取当前 thinking 参数
   */
  getThinkingArgs(): ThinkingArgs | undefined {
    return this.thinkingArgs ? { ...this.thinkingArgs } : undefined;
  }

  /**
   * 设置 thinking 提示词
   */
  setThinkingPrompt(prompt: string): void {
    this.thinkingPrompt = prompt;
  }

  /**
   * 获取 thinking 提示词
   */
  getThinkingPrompt(): string | undefined {
    return this.thinkingPrompt;
  }

  abstract request(req: ProviderRequest): Promise<AIResponse>;

  /**
   * 构建请求体（子类可覆盖）
   * 自动包含 thinkingArgs 展开
   */
  protected buildRequestBody(req: ProviderRequest): unknown {
    const messages: unknown[] = [];

    if (req.messages) {
      messages.push(
        ...req.messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
          ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
          ...(m.name ? { name: m.name } : {}),
        })),
      );
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
    const thinking = req.thinkingArgs || this.thinkingArgs;
    if (thinking) {
      Object.assign(body, thinking);
    }

    return body;
  }

  /**
   * 获取当前配置
   */
  getConfig(): Partial<ProviderStorageItem> {
    return {
      name: this.config.name,
      type: this.config.type,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      thinkingArgs: this.getThinkingArgs(),
      thinkingPrompt: this.getThinkingPrompt(),
    };
  }
}

/**
 * Provider 数据存储管理器
 */
export class ProviderStorage {
  private storage = new Map<string, ProviderStorageItem>();
  private providers = new Map<string, Provider>();

  /**
   * 添加或更新 Provider 配置
   */
  save(
    item: Omit<ProviderStorageItem, "createdAt" | "updatedAt">,
  ): ProviderStorageItem {
    const now = Date.now();
    const existing = this.storage.get(item.name);

    const fullItem: ProviderStorageItem = {
      ...item,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.storage.set(item.name, fullItem);
    return fullItem;
  }

  /**
   * 获取 Provider 配置
   */
  get(name: string): ProviderStorageItem | undefined {
    return this.storage.get(name);
  }

  /**
   * 删除 Provider 配置
   */
  delete(name: string): boolean {
    this.providers.delete(name);
    return this.storage.delete(name);
  }

  /**
   * 列出所有配置
   */
  list(): ProviderStorageItem[] {
    return Array.from(this.storage.values());
  }

  /**
   * 按类型筛选
   */
  filterByType(type: string): ProviderStorageItem[] {
    return this.list().filter((item) => item.type === type);
  }

  /**
   * 注册 Provider 实例
   */
  registerProvider(name: string, provider: Provider): void {
    this.providers.set(name, provider);
  }

  /**
   * 获取 Provider 实例
   */
  getProvider(name: string): Provider | undefined {
    return this.providers.get(name);
  }

  /**
   * 创建 Provider 实例（需要预先注册 Provider 类）
   */
  createProvider(
    name: string,
    ProviderClass: new (config: ProviderStorageItem) => Provider,
  ): Provider {
    const config = this.get(name);
    if (!config) {
      throw new Error(`Provider configuration "${name}" not found`);
    }

    const provider = new ProviderClass(config);
    this.registerProvider(name, provider);
    return provider;
  }

  /**
   * 导出配置（用于持久化）
   */
  export(): string {
    return JSON.stringify(this.list(), null, 2);
  }

  /**
   * 导入配置
   */
  import(data: string): void {
    try {
      const items: ProviderStorageItem[] = JSON.parse(data);
      for (const item of items) {
        this.save(item);
      }
    } catch (e) {
      throw new Error(`Failed to import provider config: ${e}`);
    }
  }

  /**
   * 清除所有配置
   */
  clear(): void {
    this.storage.clear();
    this.providers.clear();
  }
}

/**
 * Provider 工厂
 */
export class ProviderFactory {
  private providers = new Map<
    string,
    new (config: ProviderStorageItem) => Provider
  >();

  /**
   * 注册 Provider 类
   */
  register(
    name: string,
    ProviderClass: new (config: ProviderStorageItem) => Provider,
  ): void {
    this.providers.set(name, ProviderClass);
  }

  /**
   * 创建 Provider 实例
   */
  create(_name: string, config: ProviderStorageItem): Provider {
    const ProviderClass = this.providers.get(config.type);
    if (!ProviderClass) {
      throw new Error(`Provider type "${config.type}" not registered`);
    }
    return new ProviderClass(config);
  }

  /**
   * 列出已注册的 Provider 类型
   */
  listTypes(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 检查是否支持某类型
   */
  hasType(type: string): boolean {
    return this.providers.has(type);
  }
}

// 全局 Provider 工厂实例
export const providerFactory = new ProviderFactory();

// 全局 Provider 存储实例
export const providerStorage = new ProviderStorage();

// 导入并注册兼容性 Provider
import "./compatibility";

// 重新导出
export {
  // 主类
  OpenAICompatibleProvider,
  type OpenAICompatibleConfig,

  // 工厂方法
  createProvider,
  createOpenAI,
} from "./compatibility";
