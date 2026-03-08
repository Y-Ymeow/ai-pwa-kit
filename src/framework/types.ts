/**
 * Common Types
 * 框架通用类型定义
 */

/**
 * AI 响应的统一格式
 */
export interface AIResponse {
  /** 主要内容 */
  content: string;
  /** 思考过程（如 CoT） */
  thinking?: string;
  /** 工具调用 */
  tool?: ToolCall;
  /** 工具调用列表 */
  tools?: ToolCall[];
  /** 使用的 token 数 */
  usage?: TokenUsage;
  /** 模型信息 */
  model?: string;
  /** 完成原因 */
  finishReason?: string;
  /** 原始响应 */
  raw?: unknown;
}

/**
 * 流式响应块
 */
export interface AIStreamChunk {
  /** 内容增量 */
  content?: string;
  /** 思考过程增量 */
  thinking?: string;
  /** 是否完成 */
  done: boolean;
  /** 工具调用（通常只在最后出现） */
  tool?: ToolCall;
  /** 工具调用列表 */
  tools?: ToolCall[];
  /** 使用信息（通常只在最后出现） */
  usage?: TokenUsage;
}

/**
 * 工具调用
 */
export interface ToolCall {
  /** 工具 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
}

/**
 * Token 使用信息
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * AI 消息格式（用于构建请求）
 */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** 用于 assistant 消息中的工具调用 */
  toolCalls?: ToolCall[];
  /** 用于 tool 消息，关联 tool 调用 */
  toolCallId?: string;
  /** 可选名称 */
  name?: string;
}

/**
 * 响应构造器选项
 */
export interface ResponseBuilderOptions {
  includeThinking?: boolean;
  includeToolCalls?: boolean;
  includeUsage?: boolean;
}
