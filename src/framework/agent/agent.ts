/**
 * Agent Core
 * Agent 核心实现
 */

import type {
  AgentConfig,
  AgentState,
  AgentMessage,
  AgentToolCall,
  AgentToolResult,
  AgentExecuteResult,
  AgentStep,
  AgentHooks,
  AgentRuntimeConfig,
} from './types';
import type { FrameworkCore } from '../ai/core';
import type { AIResponse } from '../types';
import { getPresetPrompt } from './prompts';
import { getToolByName, getBasicTools } from './tools';
import type { AgentTool } from './types';

/**
 * Agent 类
 * 简化的 Agent 实现，支持 ReAct 模式
 */
export class Agent {
  private config: Required<AgentConfig>;
  private core: FrameworkCore;
  private tools: Map<string, AgentTool> = new Map();
  private state: AgentState;
  private hooks: AgentHooks;

  constructor(
    core: FrameworkCore,
    config: AgentConfig,
    hooks: AgentHooks = {}
  ) {
    this.core = core;
    this.config = {
      description: '',
      systemPrompt: '',
      tools: [],
      maxIterations: 10,
      enableThinking: true,
      enableMemory: false,
      metadata: {},
      ...config,
    };
    this.hooks = hooks;

    // 初始化状态
    this.state = {
      iteration: 0,
      messages: [],
      context: {},
      isComplete: false,
    };

    // 注册工具
    this.registerTools();
  }

  /**
   * 注册工具
   */
  private registerTools(): void {
    const toolNames = this.config.tools.length > 0
      ? this.config.tools
      : getBasicTools().map((t) => t.name);

    for (const name of toolNames) {
      const tool = getToolByName(name);
      if (tool) {
        this.tools.set(name, tool);
      }
    }
  }

  /**
   * 获取系统 Prompt
   */
  private getSystemPrompt(): string {
    const promptTemplate = getPresetPrompt('react');
    if (!promptTemplate) return this.config.systemPrompt;

    // 构建工具描述
    const toolsDesc = Array.from(this.tools.values())
      .map((tool) => {
        const params = JSON.stringify(tool.parameters.properties || {});
        return `- ${tool.name}: ${tool.description}\n  参数: ${params}`;
      })
      .join('\n');

    return `${this.config.systemPrompt}\n\n可用工具:\n${toolsDesc}`;
  }

  /**
   * 构建初始消息
   */
  private buildInitialMessages(task: string): AgentMessage[] {
    const systemPrompt = this.getSystemPrompt();

    const messages: AgentMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
        timestamp: Date.now(),
      },
      {
        role: 'user',
        content: task,
        timestamp: Date.now(),
      },
    ];

    return messages;
  }

  /**
   * 执行任务
   */
  async execute(
    task: string,
    runtimeConfig?: AgentRuntimeConfig
  ): Promise<AgentExecuteResult> {
    const startTime = Date.now();
    this.state.currentTask = task;
    this.state.messages = this.buildInitialMessages(task);
    this.state.iteration = 0;
    this.state.isComplete = false;
    this.state.result = undefined;

    try {
      while (
        !this.state.isComplete &&
        this.state.iteration < this.config.maxIterations
      ) {
        this.state.iteration++;

        // 执行一步
        const step: AgentStep = {
          type: 'thought',
          content: '',
          timestamp: Date.now(),
        };

        await this.hooks.onStepStart?.(step);

        // 调用 LLM
        const response = await this.callLLM(runtimeConfig);

        // 解析响应
        const parsed = this.parseResponse(response.content);

        if (parsed.type === 'final') {
          // 任务完成
          this.state.isComplete = true;
          this.state.result = parsed.content;
          step.type = 'final';
          step.content = parsed.content;

          await this.hooks.onStepComplete?.(step);
        } else if (parsed.type === 'action' && parsed.toolCall) {
          // 执行工具
          step.type = 'action';
          step.content = parsed.content;
          step.toolCall = parsed.toolCall;

          await this.hooks.onStepComplete?.(step);

          // 执行工具
          const toolResult = await this.executeTool(parsed.toolCall);
          step.toolResult = toolResult;

          await this.hooks.afterToolCall?.(parsed.toolCall, toolResult);

          // 检查是否是 finish 工具
          if (parsed.toolCall.name === 'finish') {
            this.state.isComplete = true;
            this.state.result = toolResult.result as string;
          }
        } else {
          // 思考
          step.type = 'thought';
          step.content = parsed.content;

          await this.hooks.onStepComplete?.(step);
        }
      }

      const result: AgentExecuteResult = {
        output: this.state.result || '任务未完成',
        status: this.state.isComplete ? 'success' : 'max_iterations',
        history: this.state.messages,
        toolCallCount: this.state.messages.filter((m) => m.toolCalls).length,
        duration: Date.now() - startTime,
      };

      await this.hooks.onComplete?.(result);
      return result;
    } catch (error) {
      const errorResult: AgentExecuteResult = {
        output: '',
        status: 'error',
        history: this.state.messages,
        toolCallCount: this.state.messages.filter((m) => m.toolCalls).length,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      await this.hooks.onError?.(error as Error);
      return errorResult;
    }
  }

  /**
   * 调用 LLM
   */
  private async callLLM(
    runtimeConfig?: AgentRuntimeConfig
  ): Promise<AIResponse> {
    const messages = this.state.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (runtimeConfig?.stream && runtimeConfig.onStream) {
      // 流式请求
      const chunks: string[] = [];

      for await (const chunk of this.core.executeStream('agent', {
        provider: this.config.provider,
        variables: { messages },
      })) {
        if (chunk.content) {
          chunks.push(chunk.content);
          runtimeConfig.onStream(chunk.content);
        }
      }

      return {
        content: chunks.join(''),
      };
    }

    // 普通请求
    return this.core.execute('agent', {
      provider: this.config.provider,
      variables: { messages },
    });
  }

  /**
   * 解析响应
   */
  private parseResponse(content: string): {
    type: 'thought' | 'action' | 'final';
    content: string;
    toolCall?: AgentToolCall;
  } {
    // 检查是否是最终答案
    const finalMatch = content.match(/\*\*最终答案\*\*[:：]\s*([\s\S]*)/i);
    if (finalMatch) {
      return {
        type: 'final',
        content: finalMatch[1].trim(),
      };
    }

    // 检查是否有工具调用
    const actionMatch = content.match(/\*\*行动\*\*[:：]?\s*```json\s*([\s\S]*?)```/);
    if (actionMatch) {
      try {
        const toolCall = JSON.parse(actionMatch[1].trim()) as {
          tool: string;
          arguments: Record<string, unknown>;
        };

        return {
          type: 'action',
          content,
          toolCall: {
            id: `${Date.now()}`,
            name: toolCall.tool,
            arguments: toolCall.arguments,
          },
        };
      } catch {
        // JSON 解析失败，当作思考
      }
    }

    // 默认是思考
    return {
      type: 'thought',
      content,
    };
  }

  /**
   * 执行工具
   */
  private async executeTool(call: AgentToolCall): Promise<AgentToolResult> {
    const tool = this.tools.get(call.name);
    const startTime = Date.now();

    if (!tool) {
      return {
        callId: call.id,
        name: call.name,
        result: null,
        error: `Tool '${call.name}' not found`,
        duration: Date.now() - startTime,
      };
    }

    // 检查是否需要确认
    if (tool.requireConfirm) {
      const confirmed = await this.hooks.beforeToolCall?.(call);
      if (confirmed === false) {
        return {
          callId: call.id,
          name: call.name,
          result: null,
          error: 'Tool execution cancelled by user',
          duration: Date.now() - startTime,
        };
      }
    }

    try {
      // 这里应该调用实际的工具实现
      // 简化版本返回模拟结果
      let result: unknown;

      switch (call.name) {
        case 'think':
          result = { status: 'ok', thought: call.arguments.thought };
          break;
        case 'finish':
          result = call.arguments.answer;
          break;
        case 'ask_user':
          result = { question: call.arguments.question, waiting: true };
          break;
        default:
          result = { status: 'executed', tool: call.name, args: call.arguments };
      }

      return {
        callId: call.id,
        name: call.name,
        result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        callId: call.id,
        name: call.name,
        result: null,
        error: error instanceof Error ? error.message : 'Tool execution failed',
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 添加工具
   */
  addTool(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 移除工具
   */
  removeTool(name: string): void {
    this.tools.delete(name);
  }

  /**
   * 获取当前状态
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * 获取配置
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.state = {
      iteration: 0,
      messages: [],
      context: {},
      isComplete: false,
    };
  }

  /**
   * 继续执行（从上次中断的地方）
   */
  async continue(
    userInput: string,
    runtimeConfig?: AgentRuntimeConfig
  ): Promise<AgentExecuteResult> {
    // 添加用户输入到消息历史
    this.state.messages.push({
      role: 'user',
      content: userInput,
      timestamp: Date.now(),
    });

    // 重置完成状态
    this.state.isComplete = false;

    // 继续执行
    return this.execute(this.state.currentTask || '', runtimeConfig);
  }
}

/**
 * 创建 Agent 工厂函数
 */
export function createAgent(
  core: FrameworkCore,
  config: AgentConfig,
  hooks?: AgentHooks
): Agent {
  return new Agent(core, config, hooks);
}

/**
 * 从预设创建 Agent
 */
export function createAgentFromPreset(
  core: FrameworkCore,
  presetName: string,
  customConfig?: Partial<AgentConfig>,
  hooks?: AgentHooks
): Agent | null {
  const presets: Record<
    string,
    Partial<AgentConfig>
  > = {
    coder: {
      name: 'coder',
      description: '编程助手',
      systemPrompt: '你是一个专业的编程助手。',
      tools: ['think', 'finish', 'read_file', 'write_file', 'analyze_code'],
    },
    researcher: {
      name: 'researcher',
      description: '研究助手',
      systemPrompt: '你是一个研究助手，擅长信息搜集和分析。',
      tools: ['think', 'finish', 'search', 'remember', 'recall'],
    },
    assistant: {
      name: 'assistant',
      description: '通用助手',
      systemPrompt: '你是一个 helpful 的助手。',
      tools: ['think', 'finish', 'ask_user'],
    },
  };

  const preset = presets[presetName];
  if (!preset) return null;

  return new Agent(
    core,
    {
      ...preset,
      ...customConfig,
      name: customConfig?.name || preset.name || 'agent',
      provider: customConfig?.provider || 'openai',
    } as AgentConfig,
    hooks
  );
}
