/**
 * Agent Types
 * Agent 模块的类型定义
 */

import type { ToolDefinition } from '../ai/tools';

/**
 * Agent 配置
 */
export interface AgentConfig {
  /** Agent 名称 */
  name: string;
  /** Agent 描述 */
  description?: string;
  /** 使用的 Provider */
  provider: string;
  /** 系统 Prompt */
  systemPrompt?: string;
  /** 可用工具列表 */
  tools?: string[];
  /** 最大迭代次数 */
  maxIterations?: number;
  /** 是否启用思考 */
  enableThinking?: boolean;
  /** 记忆功能 */
  enableMemory?: boolean;
  /** 自定义配置 */
  metadata?: Record<string, unknown>;
}

/**
 * Agent 状态
 */
export interface AgentState {
  /** 当前迭代次数 */
  iteration: number;
  /** 对话历史 */
  messages: AgentMessage[];
  /** 当前任务 */
  currentTask?: string;
  /** 上下文数据 */
  context: Record<string, unknown>;
  /** 是否完成 */
  isComplete: boolean;
  /** 最终结果 */
  result?: string;
}

/**
 * Agent 消息
 */
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: AgentToolCall[];
  toolResults?: AgentToolResult[];
  timestamp: number;
}

/**
 * Agent 工具调用
 */
export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Agent 工具结果
 */
export interface AgentToolResult {
  callId: string;
  name: string;
  result: unknown;
  error?: string;
  duration: number;
}

/**
 * Agent 执行结果
 */
export interface AgentExecuteResult {
  /** 最终输出 */
  output: string;
  /** 执行状态 */
  status: 'success' | 'error' | 'max_iterations';
  /** 执行历史 */
  history: AgentMessage[];
  /** 工具调用次数 */
  toolCallCount: number;
  /** 总耗时（毫秒） */
  duration: number;
  /** 错误信息 */
  error?: string;
}

/**
 * Agent 工具定义
 */
export interface AgentTool extends ToolDefinition {
  /** 工具分类 */
  category?: 'file' | 'search' | 'execute' | 'api' | 'custom';
  /** 是否需要确认 */
  requireConfirm?: boolean;
  /** 工具图标 */
  icon?: string;
  /** 示例用法 */
  examples?: string[];
}

/**
 * Agent 步骤
 */
export interface AgentStep {
  /** 步骤类型 */
  type: 'thought' | 'action' | 'observation' | 'final';
  /** 步骤内容 */
  content: string;
  /** 工具调用 */
  toolCall?: AgentToolCall;
  /** 工具结果 */
  toolResult?: AgentToolResult;
  /** 时间戳 */
  timestamp: number;
}

/**
 * Agent 观察结果
 */
export interface AgentObservation {
  /** 观察类型 */
  type: 'tool_result' | 'error' | 'user_input';
  /** 观察内容 */
  content: string;
  /** 相关数据 */
  data?: unknown;
}

/**
 * Agent Hook
 */
export interface AgentHooks {
  /** 步骤开始 */
  onStepStart?: (step: AgentStep) => void | Promise<void>;
  /** 步骤完成 */
  onStepComplete?: (step: AgentStep) => void | Promise<void>;
  /** 工具调用前 */
  beforeToolCall?: (call: AgentToolCall) => boolean | Promise<boolean>;
  /** 工具调用后 */
  afterToolCall?: (call: AgentToolCall, result: AgentToolResult) => void | Promise<void>;
  /** Agent 完成 */
  onComplete?: (result: AgentExecuteResult) => void | Promise<void>;
  /** 发生错误 */
  onError?: (error: Error) => void | Promise<void>;
}

/**
 * Agent 运行时配置
 */
export interface AgentRuntimeConfig {
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 温度参数 */
  temperature?: number;
  /** 最大 Token */
  maxTokens?: number;
  /** 是否流式输出 */
  stream?: boolean;
  /** 流式回调 */
  onStream?: (chunk: string) => void;
}

/**
 * Agent 能力
 */
export interface AgentCapability {
  /** 能力名称 */
  name: string;
  /** 能力描述 */
  description: string;
  /** 所需工具 */
  requiredTools: string[];
  /** 示例 */
  examples: string[];
}

/**
 * 创建 Agent 选项
 */
export interface CreateAgentOptions extends Partial<AgentConfig> {
  /** 从预设创建 */
  fromPreset?: string;
}
