/**
 * Framework Core
 * 负责协调 Prompts 和 Providers 的匹配与执行
 */

import type { PromptTemplate } from './prompts';
import type { Provider, ProviderStorage, ThinkingArgs } from './providers';
import type { AIResponse, AIStreamChunk, AIMessage } from '../types';
import type { ToolManager, ToolDefinition } from './tools';

export interface CoreConfig {
  defaultProvider?: string;
  timeout?: number;
  retries?: number;
}

export interface ExecuteOptions {
  /** 指定 Provider */
  provider?: string;
  /** 变量（用于模板渲染） */
  variables?: Record<string, unknown>;
  /** 是否流式输出 */
  stream?: boolean;
  /** 流式回调 */
  onStream?: (chunk: AIStreamChunk) => void;
  /** 覆盖模型 */
  model?: string;
  /** 温度参数 */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 工具定义（覆盖 ToolManager） */
  tools?: ToolDefinition[];
  /** 工具选择策略 */
  toolChoice?: 'auto' | 'none' | 'any' | string;
  /** Thinking 参数（直接展开到请求体） */
  thinkingArgs?: ThinkingArgs;
  /** Thinking 提示词 */
  thinkingPrompt?: string;
}

/**
 * 框架核心类
 * 协调 Prompts、Providers 和 Tools 的执行
 */
export class FrameworkCore {
  private prompts = new Map<string, PromptTemplate>();
  private providers = new Map<string, Provider>();
  private toolManagers = new Map<string, ToolManager>();
  private storage: ProviderStorage | undefined;
  private config: CoreConfig;

  constructor(config: CoreConfig = {}, storage?: ProviderStorage) {
    this.config = {
      timeout: 30000,
      retries: 3,
      ...config,
    };
    this.storage = storage;
  }

  /**
   * 设置 ProviderStorage（用于延迟注入）
   */
  setStorage(storage: ProviderStorage): void {
    this.storage = storage;
  }

  /**
   * 注册 Prompt 模板
   */
  registerPrompt(name: string, template: PromptTemplate): void {
    this.prompts.set(name, template);
  }

  /**
   * 批量注册 Prompt 模板
   */
  registerPrompts(templates: PromptTemplate[]): void {
    for (const template of templates) {
      this.prompts.set(template.name, template);
    }
  }

  /**
   * 注册 Provider 实例
   */
  registerProvider(name: string, provider: Provider): void {
    this.providers.set(name, provider);
  }

  /**
   * 从存储创建并注册 Provider
   */
  createProvider(name: string, ProviderClass: new (config: { name: string; type: string; apiKey: string; createdAt: number; updatedAt: number }) => Provider): Provider {
    if (!this.storage) {
      throw new Error('ProviderStorage not set');
    }

    const provider = this.storage.createProvider(name, ProviderClass);
    this.providers.set(name, provider);
    return provider;
  }

  /**
   * 注册 ToolManager
   */
  registerToolManager(name: string, toolManager: ToolManager): void {
    this.toolManagers.set(name, toolManager);
  }

  /**
   * 获取已注册的 Prompt
   */
  getPrompt(name: string): PromptTemplate | undefined {
    return this.prompts.get(name);
  }

  /**
   * 获取已注册的 Provider
   */
  getProvider(name: string): Provider | undefined {
    return this.providers.get(name);
  }

  /**
   * 获取已注册的 ToolManager
   */
  getToolManager(name: string): ToolManager | undefined {
    return this.toolManagers.get(name);
  }

  /**
   * 启用指定 Provider 的思考功能
   */
  enableThinking(providerName: string, args?: ThinkingArgs, thinkingPrompt?: string): void {
    const provider = this.providers.get(providerName);
    if (provider && provider.enableThinking) {
      provider.enableThinking(args, thinkingPrompt);
    }
  }

  /**
   * 禁用指定 Provider 的思考功能
   */
  disableThinking(providerName: string, args?: ThinkingArgs): void {
    const provider = this.providers.get(providerName);
    if (provider && provider.disableThinking) {
      provider.disableThinking(args);
    }
  }

  /**
   * 设置 Provider 的 thinking 参数
   */
  setThinkingArgs(providerName: string, args: ThinkingArgs): void {
    const provider = this.providers.get(providerName);
    if (provider && provider.setThinkingArgs) {
      provider.setThinkingArgs(args);
    }
  }

  /**
   * 设置 Provider 的 thinking 提示词
   */
  setThinkingPrompt(providerName: string, prompt: string): void {
    const provider = this.providers.get(providerName);
    if (provider && provider.setThinkingPrompt) {
      provider.setThinkingPrompt(prompt);
    }
  }

  /**
   * 构建消息数组（使用 Prompt 模板）
   */
  buildMessages(
    promptName: string,
    variables?: Record<string, unknown>
  ): AIMessage[] {
    const template = this.prompts.get(promptName);
    if (!template) {
      throw new Error(`Prompt "${promptName}" not found`);
    }

    const messages: AIMessage[] = [];

    if (template.fragments && template.fragments.length > 0) {
      for (const fragment of template.fragments) {
        // 检查条件
        if (fragment.condition && !fragment.condition(variables || {})) {
          continue;
        }

        // 替换变量
        const content = this.replaceVariables(fragment.template, variables || {});

        messages.push({
          role: fragment.role,
          content,
        });
      }
    } else if (template.template) {
      // 使用简单模板作为 user 消息
      messages.push({
        role: 'user',
        content: this.replaceVariables(template.template, variables || {}),
      });
    }

    return messages;
  }

  /**
   * 执行 AI 请求
   */
  async execute(
    promptName: string,
    options: ExecuteOptions = {}
  ): Promise<AIResponse> {
    const messages = this.buildMessages(promptName, options.variables);
    return this.executeWithMessages(messages, options);
  }

  /**
   * 使用消息数组直接执行请求
   */
  async executeWithMessages(
    messages: AIMessage[],
    options: ExecuteOptions = {}
  ): Promise<AIResponse> {
    const providerName = options.provider || this.config.defaultProvider;
    if (!providerName) {
      throw new Error('No provider specified');
    }

    let provider = this.providers.get(providerName);

    // 如果未注册，尝试从 storage 创建
    if (!provider && this.storage) {
      throw new Error(`Provider "${providerName}" not registered. Call createProvider() first with the Provider class.`);
    }

    if (!provider) {
      throw new Error(`Provider "${providerName}" not found`);
    }

    // 准备工具定义
    const tools = options.tools || this.getToolsFromManager(providerName);

    // 流式请求
    if (options.stream) {
      if (!provider.stream) {
        throw new Error(`Provider "${providerName}" does not support streaming`);
      }

      const chunks: AIStreamChunk[] = [];

      for await (const chunk of provider.stream({
        messages,
        stream: true,
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        tools,
        toolChoice: options.toolChoice,
        thinkingArgs: options.thinkingArgs,
        thinkingPrompt: options.thinkingPrompt,
      })) {
        if (options.onStream) {
          options.onStream(chunk);
        }
        chunks.push(chunk);
      }

      return {
        content: chunks.map((c) => c.content || '').join(''),
        thinking: chunks.map((c) => c.thinking || '').join('') || undefined,
        tool: chunks[chunks.length - 1]?.tool,
        tools: chunks[chunks.length - 1]?.tools,
        usage: chunks[chunks.length - 1]?.usage,
      };
    }

    // 普通请求
    return provider.request({
      messages,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      tools,
      toolChoice: options.toolChoice,
      thinkingArgs: options.thinkingArgs,
      thinkingPrompt: options.thinkingPrompt,
    });
  }

  /**
   * 执行流式请求（返回 AsyncIterable）
   */
  async *executeStream(
    promptName: string,
    options: Omit<ExecuteOptions, 'stream' | 'onStream'> = {}
  ): AsyncIterableIterator<AIStreamChunk> {
    const messages = this.buildMessages(promptName, options.variables);

    const providerName = options.provider || this.config.defaultProvider;
    if (!providerName) {
      throw new Error('No provider specified');
    }

    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider "${providerName}" not found`);
    }

    if (!provider.stream) {
      throw new Error(`Provider "${providerName}" does not support streaming`);
    }

    // 准备工具定义
    const tools = options.tools || this.getToolsFromManager(providerName);

    yield* provider.stream({
      messages,
      stream: true,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      tools,
      toolChoice: options.toolChoice,
      thinkingArgs: options.thinkingArgs,
      thinkingPrompt: options.thinkingPrompt,
    });
  }

  /**
   * 获取工具定义
   */
  private getToolsFromManager(providerName: string): ToolDefinition[] | undefined {
    const toolManager = this.toolManagers.get(providerName);
    if (toolManager) {
      return toolManager.getAllDefinitions();
    }
    return undefined;
  }

  /**
   * 变量替换
   */
  private replaceVariables(
    template: string,
    variables: Record<string, unknown>
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = variables[key];
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * 列出所有已注册的 prompts
   */
  listPrompts(): string[] {
    return Array.from(this.prompts.keys());
  }

  /**
   * 列出所有已注册的 providers
   */
  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 列出所有已注册的 tool managers
   */
  listToolManagers(): string[] {
    return Array.from(this.toolManagers.keys());
  }
}
