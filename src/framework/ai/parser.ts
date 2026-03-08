/**
 * Response Parser Module
 * 负责解析各种 AI Provider 的响应格式
 * 兼容：原生格式、<think>/<thinking> 标签、<tool> 标签
 */

import type { AIResponse, AIStreamChunk, ToolCall, TokenUsage } from '../types';

/**
 * 原始响应数据类型
 */
export interface RawResponse {
  [key: string]: unknown;
}

/**
 * 解析器配置
 */
export interface ParserConfig {
  /** 是否提取思考内容 */
  extractThinking?: boolean;
  /** 思考内容字段路径 */
  thinkingPath?: string;
  /** 内容字段路径 */
  contentPath?: string;
  /** 工具调用字段路径 */
  toolCallsPath?: string;
  /** 使用信息字段路径 */
  usagePath?: string;
  /** 模型字段路径 */
  modelPath?: string;
  /** 完成原因字段路径 */
  finishReasonPath?: string;
  /** 支持的 thinking 标签 */
  thinkingTags?: string[];
}

/**
 * 从对象中按路径获取值
 */
function getValueByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;

  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * 解析工具调用（OpenAI 格式）
 */
function parseToolCalls(toolCalls: unknown): Array<{ id: string; name: string; arguments: Record<string, unknown> }> | undefined {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return undefined;
  }

  return toolCalls.map((tc: unknown) => {
    const t = tc as Record<string, unknown>;
    const func = t.function as Record<string, unknown> | undefined;

    return {
      id: String(t.id || ''),
      name: String(func?.name || ''),
      arguments: (() => {
        try {
          const argsStr = String(func?.arguments || '{}');
          return JSON.parse(argsStr);
        } catch {
          return {};
        }
      })(),
    };
  });
}

/**
 * 解析使用信息
 */
function parseUsage(usage: unknown): TokenUsage | undefined {
  if (!usage || typeof usage !== 'object') return undefined;

  const u = usage as Record<string, number>;
  return {
    promptTokens: u.prompt_tokens || u.promptTokens || 0,
    completionTokens: u.completion_tokens || u.completionTokens || 0,
    totalTokens: u.total_tokens || u.totalTokens || 0,
  };
}

/**
 * 从文本中提取 thinking 内容
 * 兼容：<think>, <thinking>, <reasoning> 等标签
 */
export function extractThinkingFromContent(content: string, tags: string[] = ['think', 'thinking', 'reasoning']): { content: string; thinking?: string } {
  let thinking: string | undefined;
  let cleanContent = content;

  for (const tag of tags) {
    // 匹配 <tag>...</tag> 或 <tag>...（未闭合）
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)(?:<\\/${tag}>|$)`, 'i');
    const match = cleanContent.match(regex);

    if (match) {
      thinking = (thinking || '') + match[1].trim();
      // 从内容中移除 thinking 标签部分
      cleanContent = cleanContent.replace(match[0], '').trim();
    }
  }

  return {
    content: cleanContent,
    thinking: thinking || undefined,
  };
}

/**
 * 从文本中提取工具调用（<tool> 标签格式）
 * 用于不支持原生工具调用的模型
 */
export function extractToolsFromContent(content: string): { content: string; tools?: ToolCall[]; tool?: ToolCall } {
  // 匹配 <tool name="xxx">{...}</tool> 格式
  const toolRegex = /<tool\s+name="([^"]+)"(?:\s+id="([^"]*)")?>([\s\S]*?)<\/tool>/gi;
  const tools: ToolCall[] = [];
  let cleanContent = content;
  let match: RegExpExecArray | null;

  while ((match = toolRegex.exec(content)) !== null) {
    const name = match[1];
    const id = match[2] || `call_${Date.now()}_${tools.length}`;
    const argsStr = match[3].trim();

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(argsStr);
    } catch {
      // 如果不是有效的 JSON，尝试作为字符串参数
      args = { value: argsStr };
    }

    tools.push({ id, name, arguments: args });

    // 从内容中移除 tool 标签
    cleanContent = cleanContent.replace(match[0], '').trim();
  }

  // 也尝试匹配 JSON 格式的工具调用
  // 例如：{"tool": "getWeather", "arguments": {"city": "Beijing"}}
  try {
    const jsonRegex = /\{[\s\S]*?"tool"\s*:\s*"([^"]+)"[\s\S]*?\}/g;
    while ((match = jsonRegex.exec(content)) !== null) {
      const parsed = JSON.parse(match[0]);
      if (parsed.tool) {
        tools.push({
          id: `call_${Date.now()}_${tools.length}`,
          name: String(parsed.tool),
          arguments: (parsed.arguments as Record<string, unknown>) || {},
        });
        cleanContent = cleanContent.replace(match[0], '').trim();
      }
    }
  } catch {
    // 忽略 JSON 解析错误
  }

  return {
    content: cleanContent,
    tools: tools.length > 0 ? tools : undefined,
    tool: tools[0],
  };
}

/**
 * 标准 OpenAI 格式解析器
 * 同时兼容 reasoning_content 字段和 <think> 标签
 */
export function parseOpenAIResponse(data: RawResponse): AIResponse {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const choice = choices?.[0];
  const message = choice?.message as Record<string, unknown> | undefined;
  const delta = choice?.delta as Record<string, unknown> | undefined;

  // 优先使用 delta（流式），否则使用 message（普通响应）
  const contentSource = delta || message;

  // 解析内容
  let content = String(contentSource?.content || '');

  // 尝试从 reasoning_content/reasoning 字段获取思考内容（DeepSeek 等模型格式）
  let thinking: string | undefined;
  const reasoningContent = (contentSource as Record<string, unknown>)?.reasoning_content
    || (contentSource as Record<string, unknown>)?.reasoning;

  if (reasoningContent) {
    thinking = String(reasoningContent);
  }

  // 解析工具调用（原生格式）
  const toolCallsData = contentSource?.tool_calls;
  let tools = parseToolCalls(toolCallsData);
  let tool = tools?.[0];

  // 如果没有原生工具调用，尝试从内容中提取 <tool> 标签
  if (!tools && content) {
    const extracted = extractToolsFromContent(content);
    if (extracted.tools) {
      tools = extracted.tools;
      tool = extracted.tool;
      content = extracted.content;
    }
  }

  // 如果内容中有 <think> 或 <thinking> 标签，提取思考内容
  const thinkingExtraction = extractThinkingFromContent(content);
  if (thinkingExtraction.thinking) {
    thinking = thinking ? thinking + '\n' + thinkingExtraction.thinking : thinkingExtraction.thinking;
    content = thinkingExtraction.content;
  }

  // 解析使用信息
  const usage = parseUsage(data.usage);

  return {
    content,
    thinking,
    tool,
    tools,
    usage,
    model: String(data.model || ''),
    finishReason: String(choice?.finish_reason || ''),
    raw: data,
  };
}

/**
 * 流式数据块解析器（OpenAI 格式）
 * 兼容 reasoning_content 字段
 */
export function parseOpenAIStreamChunk(data: RawResponse): AIStreamChunk & { model?: string; finishReason?: string } {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;

  if (!choices || choices.length === 0) {
    // 检查是否有 usage 信息（流式最后一条）
    const usage = parseUsage(data.usage);
    if (usage) {
      return { done: true, usage };
    }
    return { done: false };
  }

  const choice = choices[0];
  const delta = choice?.delta as Record<string, unknown> | undefined;
  const finishReason = choice?.finish_reason as string | undefined;

  // 解析内容
  const content = delta?.content as string | undefined;

  // 解析思考内容（DeepSeek 等格式）
  const thinking = (delta as Record<string, unknown>)?.reasoning_content as string | undefined
    || (delta as Record<string, unknown>)?.reasoning as string | undefined;

  // 解析工具调用
  const toolCalls = delta?.tool_calls as Array<Record<string, unknown>> | undefined;
  const tools = parseToolCalls(toolCalls);

  // 解析使用信息
  const usage = parseUsage(data.usage);
  const model = data.model as string | undefined;

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
 * Anthropic Claude 格式解析器
 * 支持 thinking 内容块
 */
export function parseClaudeResponse(data: RawResponse): AIResponse {
  const content = data.content as Array<Record<string, unknown>> | undefined;

  // 合并所有文本内容
  let textContent = '';
  let thinking: string | undefined;
  const tools: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];

  if (Array.isArray(content)) {
    for (const item of content) {
      const type = String(item.type || '');

      if (type === 'text') {
        textContent += String(item.text || '');
      } else if (type === 'thinking') {
        thinking = String(item.thinking || '');
      } else if (type === 'tool_use') {
        tools.push({
          id: String(item.id || ''),
          name: String(item.name || ''),
          arguments: (item.input as Record<string, unknown>) || {},
        });
      }
    }
  }

  // 如果文本内容中有 <think> 标签，也提取
  const extraction = extractThinkingFromContent(textContent);
  if (extraction.thinking) {
    thinking = thinking ? thinking + '\n' + extraction.thinking : extraction.thinking;
    textContent = extraction.content;
  }

  // 检查是否有 <tool> 标签
  const toolExtraction = extractToolsFromContent(textContent);
  if (toolExtraction.tools) {
    tools.push(...toolExtraction.tools);
    textContent = toolExtraction.content;
  }

  // 解析使用信息
  const usageData = data.usage as Record<string, number> | undefined;
  const usage = usageData
    ? {
        promptTokens: usageData.input_tokens || 0,
        completionTokens: usageData.output_tokens || 0,
        totalTokens: (usageData.input_tokens || 0) + (usageData.output_tokens || 0),
      }
    : undefined;

  return {
    content: textContent,
    thinking,
    tool: tools[0],
    tools: tools.length > 0 ? tools : undefined,
    usage,
    model: String(data.model || ''),
    finishReason: String(data.stop_reason || ''),
    raw: data,
  };
}

/**
 * 通用自定义解析器
 */
export function createParser(config: ParserConfig) {
  return function parse(data: RawResponse): AIResponse {
    let content = String(getValueByPath(data, config.contentPath || 'choices.0.message.content') || '');

    // 尝试从指定路径获取 thinking
    let thinking: string | undefined;
    if (config.extractThinking !== false) {
      const thinkingPath = config.thinkingPath || 'choices.0.message.reasoning_content';
      const reasoningContent = getValueByPath(data, thinkingPath);
      if (reasoningContent) {
        thinking = String(reasoningContent);
      }
    }

    // 解析工具调用
    const toolCallsData = getValueByPath(data, config.toolCallsPath || 'choices.0.message.tool_calls');
    let parsedTools = parseToolCalls(toolCallsData);

    // 如果没有原生工具，尝试从内容提取
    if (!parsedTools && content) {
      const extracted = extractToolsFromContent(content);
      if (extracted.tools) {
        parsedTools = extracted.tools;
        content = extracted.content;
      }
    }

    // 从内容中提取 thinking 标签
    const thinkingExtraction = extractThinkingFromContent(content, config.thinkingTags);
    if (thinkingExtraction.thinking) {
      thinking = thinking ? thinking + '\n' + thinkingExtraction.thinking : thinkingExtraction.thinking;
      content = thinkingExtraction.content;
    }

    const usageData = getValueByPath(data, config.usagePath || 'usage');
    const usage = parseUsage(usageData);

    return {
      content,
      thinking,
      tool: parsedTools?.[0],
      tools: parsedTools,
      usage,
      model: String(getValueByPath(data, config.modelPath || 'model') || ''),
      finishReason: String(getValueByPath(data, config.finishReasonPath || 'choices.0.finish_reason') || ''),
      raw: data,
    };
  };
}

/**
 * 解析器注册表
 */
export class ResponseParserRegistry {
  private parsers = new Map<string, (data: RawResponse) => AIResponse>();
  private streamParsers = new Map<string, (data: RawResponse) => AIStreamChunk & { model?: string; finishReason?: string }>();

  /**
   * 注册响应解析器
   */
  register(name: string, parser: (data: RawResponse) => AIResponse): void {
    this.parsers.set(name, parser);
  }

  /**
   * 注册流式解析器
   */
  registerStream(name: string, parser: (data: RawResponse) => AIStreamChunk & { model?: string; finishReason?: string }): void {
    this.streamParsers.set(name, parser);
  }

  /**
   * 解析响应
   */
  parse(name: string, data: RawResponse): AIResponse {
    const parser = this.parsers.get(name);
    if (!parser) {
      // 默认使用 OpenAI 格式
      return parseOpenAIResponse(data);
    }
    return parser(data);
  }

  /**
   * 解析流式数据块
   */
  parseStream(name: string, data: RawResponse): AIStreamChunk & { model?: string; finishReason?: string } {
    const parser = this.streamParsers.get(name);
    if (!parser) {
      // 默认使用 OpenAI 格式
      return parseOpenAIStreamChunk(data);
    }
    return parser(data);
  }

  /**
   * 列出已注册的解析器
   */
  list(): string[] {
    return Array.from(this.parsers.keys());
  }
}

// 全局解析器注册表
export const parserRegistry = new ResponseParserRegistry();

// 注册默认解析器
parserRegistry.register('openai', parseOpenAIResponse);
parserRegistry.registerStream('openai', parseOpenAIStreamChunk);
parserRegistry.register('claude', parseClaudeResponse);