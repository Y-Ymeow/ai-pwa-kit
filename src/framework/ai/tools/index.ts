/**
 * Tools Module
 * 工具调用管理，兼容支持和不支持工具的模型
 * 支持：<tool> 标签格式、原生格式
 */

import type { ToolCall } from '../../types';

/**
 * 工具参数定义
 */
export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: unknown[];
  required?: boolean;
  /** 对象类型的属性定义 */
  properties?: Record<string, ToolParameter>;
  /** 数组类型的元素定义 */
  items?: ToolParameter;
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数定义 */
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 工具调用 ID */
  toolCallId: string;
  /** 工具名称 */
  name: string;
  /** 执行结果 */
  result: unknown;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * 工具处理器函数类型
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

/**
 * 工具配置
 */
export interface ToolConfig {
  /** 是否强制使用工具（即使模型支持自动选择） */
  force?: boolean;
  /** 指定要使用的工具名称 */
  toolChoice?: 'auto' | 'none' | 'any' | string;
  /** 并行执行工具 */
  parallel?: boolean;
  /** 使用 <tool> 标签格式（用于不支持原生工具的模型） */
  useTagFormat?: boolean;
  /** 自定义 tool 标签名称 */
  tagName?: string;
}

/**
 * 工具管理器
 * 管理工具定义、执行和兼容处理
 */
export class ToolManager {
  private definitions = new Map<string, ToolDefinition>();
  private handlers = new Map<string, ToolHandler>();
  private config: ToolConfig = {};

  constructor(config: ToolConfig = {}) {
    this.config = config;
  }

  /**
   * 注册工具
   */
  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.definitions.set(definition.name, definition);
    this.handlers.set(definition.name, handler);
  }

  /**
   * 批量注册工具
   */
  registerBatch(tools: Array<{ definition: ToolDefinition; handler: ToolHandler }>): void {
    for (const { definition, handler } of tools) {
      this.register(definition, handler);
    }
  }

  /**
   * 获取工具定义
   */
  getDefinition(name: string): ToolDefinition | undefined {
    return this.definitions.get(name);
  }

  /**
   * 获取工具处理器
   */
  getHandler(name: string): ToolHandler | undefined {
    return this.handlers.get(name);
  }

  /**
   * 获取所有工具定义（用于 API 请求）
   */
  getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * 转换为 OpenAI 格式的 tools
   */
  toOpenAIFormat(): Array<{ type: 'function'; function: ToolDefinition }> {
    return this.getAllDefinitions().map((def) => ({
      type: 'function' as const,
      function: def,
    }));
  }

  /**
   * 转换为 Claude 格式的 tools
   */
  toClaudeFormat(): ToolDefinition[] {
    return this.getAllDefinitions();
  }

  /**
   * 生成 <tool> 标签格式的工具说明
   * 用于不支持原生工具调用的模型
   */
  toTagFormat(tagName: string = 'tool'): string {
    if (this.definitions.size === 0) return '';

    const toolDescriptions = this.getAllDefinitions()
      .map((tool) => {
        const params = Object.entries(tool.parameters.properties)
          .map(([name, param]) => {
            const required = tool.parameters.required?.includes(name) ? ' (required)' : '';
            return `    - ${name}: ${param.type}${required} - ${param.description}`;
          })
          .join('\n');

        return `## ${tool.name}\n${tool.description}\nParameters:\n${params || '    (none)'}`;
      })
      .join('\n\n');

    return `You have access to the following tools. When you need to use a tool, respond with XML format:
<${tagName} name="tool_name" id="call_id">
{
  "arg1": "value1",
  ...
}
</${tagName}>

Available tools:

${toolDescriptions}

If you don't need to use a tool, respond normally without the <${tagName}> tag.`;
  }

  /**
   * 检查是否支持工具
   */
  hasTool(name: string): boolean {
    return this.definitions.has(name);
  }

  /**
   * 列出所有工具名称
   */
  list(): string[] {
    return Array.from(this.definitions.keys());
  }

  /**
   * 执行工具调用
   */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const handler = this.handlers.get(toolCall.name);

    if (!handler) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: null,
        success: false,
        error: `Tool "${toolCall.name}" not found`,
      };
    }

    try {
      const result = await handler(toolCall.arguments);
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result,
        success: true,
      };
    } catch (error) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: null,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 批量执行工具调用
   */
  async executeBatch(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    if (this.config.parallel) {
      // 并行执行
      return Promise.all(toolCalls.map((tc) => this.execute(tc)));
    } else {
      // 串行执行
      const results: ToolResult[] = [];
      for (const tc of toolCalls) {
        results.push(await this.execute(tc));
      }
      return results;
    }
  }

  /**
   * 移除工具
   */
  unregister(name: string): boolean {
    this.handlers.delete(name);
    return this.definitions.delete(name);
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.definitions.clear();
    this.handlers.clear();
  }

  /**
   * 获取 tool_choice 参数
   */
  getToolChoice(): string | { type: string; function?: { name: string } } | undefined {
    if (this.config.toolChoice === 'any') {
      return 'required';
    }
    if (this.config.toolChoice && this.config.toolChoice !== 'auto' && this.config.toolChoice !== 'none') {
      // 指定特定工具
      return {
        type: 'function',
        function: { name: this.config.toolChoice },
      };
    }
    return this.config.toolChoice;
  }

  /**
   * 是否需要使用 <tool> 标签格式
   */
  shouldUseTagFormat(): boolean {
    return this.config.useTagFormat ?? false;
  }

  /**
   * 获取 tool 标签名称
   */
  getTagName(): string {
    return this.config.tagName || 'tool';
  }
}

/**
 * 工具调用链
 * 用于不支持原生工具调用的模型，通过 <tool> 标签模拟工具调用
 */
export class ToolChain {
  private tools: ToolDefinition[] = [];
  private history: Array<{ role: 'assistant' | 'tool'; content: string; toolCallId?: string }> = [];
  private tagName: string;

  constructor(tools: ToolDefinition[] = [], tagName: string = 'tool') {
    this.tools = tools;
    this.tagName = tagName;
  }

  /**
   * 生成工具说明 prompt（<tool> 标签格式）
   */
  generateToolPrompt(): string {
    if (this.tools.length === 0) return '';

    const toolDescriptions = this.tools
      .map((tool) => {
        const params = Object.entries(tool.parameters.properties)
          .map(([name, param]) => {
            const required = tool.parameters.required?.includes(name) ? ' (required)' : '';
            return `    - ${name}: ${param.type}${required} - ${param.description}`;
          })
          .join('\n');

        return `## ${tool.name}\n${tool.description}\nParameters:\n${params || '    (none)'}`;
      })
      .join('\n\n');

    return `You have access to the following tools. When you need to use a tool, respond with XML format:
<${this.tagName} name="tool_name" id="call_id">
{
  "arg1": "value1",
  ...
}
</${this.tagName}>

Available tools:

${toolDescriptions}

If you don't need to use a tool, respond normally without the <${this.tagName}> tag.`;
  }

  /**
   * 解析模型响应中的 <tool> 标签
   * @returns 解析出的工具调用数组
   */
  parseToolCalls(response: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // 匹配 <tool name="xxx" id="xxx">{...}</tool> 格式
    const regex = new RegExp(`<${this.tagName}\\s+name="([^"]+)"(?:\\s+id="([^"]*)")?>([\\s\\S]*?)</${this.tagName}>`, 'gi');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(response)) !== null) {
      const name = match[1];
      const id = match[2] || `call_${Date.now()}_${toolCalls.length}`;
      const argsStr = match[3].trim();

      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(argsStr);
      } catch {
        // 如果不是有效的 JSON，尝试作为字符串参数
        args = { value: argsStr };
      }

      toolCalls.push({ id, name, arguments: args });
    }

    // 也尝试匹配简化的 JSON 格式
    // {"tool": "getWeather", "arguments": {"city": "Beijing"}}
    try {
      const jsonRegex = /\{[\s\S]*?"tool"\s*:\s*"([^"]+)"[\s\S]*?\}/g;
      while ((match = jsonRegex.exec(response)) !== null) {
        const parsed = JSON.parse(match[0]);
        if (parsed.tool) {
          toolCalls.push({
            id: `call_${Date.now()}_${toolCalls.length}`,
            name: String(parsed.tool),
            arguments: (parsed.arguments as Record<string, unknown>) || {},
          });
        }
      }
    } catch {
      // 忽略 JSON 解析错误
    }

    return toolCalls;
  }

  /**
   * 从响应中移除 <tool> 标签，返回干净的内容
   */
  extractContent(response: string): string {
    const regex = new RegExp(`<${this.tagName}\\s+[^>]*>[\\s\\S]*?</${this.tagName}>`, 'gi');
    return response.replace(regex, '').trim();
  }

  /**
   * 解析完整响应（提取工具调用和干净内容）
   */
  parseResponse(response: string): { content: string; toolCalls: ToolCall[] } {
    return {
      content: this.extractContent(response),
      toolCalls: this.parseToolCalls(response),
    };
  }

  /**
   * 添加工具调用到历史
   */
  addToolCall(toolCall: ToolCall, result: ToolResult): void {
    this.history.push({
      role: 'assistant',
      content: `<${this.tagName} name="${toolCall.name}" id="${toolCall.id}">\n${JSON.stringify(toolCall.arguments, null, 2)}\n</${this.tagName}>`,
      toolCallId: toolCall.id,
    });
    this.history.push({
      role: 'tool',
      content: JSON.stringify(result.result),
      toolCallId: toolCall.id,
    });
  }

  /**
   * 获取完整对话历史（包括工具调用）
   */
  getHistory(): Array<{ role: 'assistant' | 'tool'; content: string; toolCallId?: string }> {
    return [...this.history];
  }

  /**
   * 清空历史
   */
  clear(): void {
    this.history = [];
  }
}

/**
 * 创建工具定义工厂函数
 */
export function createTool(
  name: string,
  description: string,
  parameters: ToolDefinition['parameters'],
  handler: ToolHandler
): { definition: ToolDefinition; handler: ToolHandler } {
  return {
    definition: {
      name,
      description,
      parameters,
    },
    handler,
  };
}

/**
 * 参数构建器
 */
export function buildParameters(
  properties: Record<string, Omit<ToolParameter, 'required'>>,
  required?: string[]
): ToolDefinition['parameters'] {
  return {
    type: 'object',
    properties: Object.entries(properties).reduce((acc, [key, value]) => {
      acc[key] = value as ToolParameter;
      return acc;
    }, {} as Record<string, ToolParameter>),
    required,
  };
}

/**
 * 从文本中提取工具调用（通用函数）
 * 支持 <tool> 标签和 JSON 格式
 */
export function extractToolCallsFromText(
  text: string,
  tagName: string = 'tool'
): { content: string; toolCalls: ToolCall[] } {
  const chain = new ToolChain([], tagName);
  return chain.parseResponse(text);
}