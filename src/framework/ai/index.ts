/**
 * AI Module
 * 人工智能相关功能的统一入口
 */

// Parser
export {
  parseOpenAIResponse,
  parseOpenAIStreamChunk,
  parseClaudeResponse,
  createParser,
  ResponseParserRegistry,
  parserRegistry,
  extractThinkingFromContent,
  extractToolsFromContent,
  type RawResponse,
  type ParserConfig,
} from './parser';

// Prompts
export {
  PromptManager,
  PromptBuilder,
  createPrompt,
  createPromptWithFragments,
  createFragment,
  type PromptTemplate,
  type PromptVariable,
  type PromptFragment,
  type PromptRole,
} from './prompts';

// Providers
export {
  BaseProvider,
  ProviderFactory,
  ProviderStorage,
  providerFactory,
  providerStorage,
  type Provider,
  type ProviderRequest,
  type ProviderStorageItem,
  type Message,
  type ThinkingArgs,
  
  // OpenAI 兼容 Provider
  OpenAICompatibleProvider,
  type OpenAICompatibleConfig,
  
  // 工厂方法
  createProvider,
  createOpenAI,
} from './providers';

// 保留原始 OpenAI Provider 以兼容旧代码
export { OpenAIProvider, type OpenAIConfig } from './providers/openai';

// Tools
export {
  ToolManager,
  ToolChain,
  createTool,
  buildParameters,
  extractToolCallsFromText,
  type ToolDefinition,
  type ToolParameter,
  type ToolResult,
  type ToolHandler,
  type ToolConfig,
} from './tools';

// Core
export { FrameworkCore, type CoreConfig, type ExecuteOptions } from './core';

// Request - AI HTTP 请求
export {
  // AI 特定功能
  parseSSEChunk,
  aiStreamGenerator,
  createAIRequestManager,
  sendAIRequest,
  streamAIRequest,
  sendAIRequestWithRetry,

  // 重导出 requests 模块
  RequestManager,
  createAutoExternalAdapter,
  RequestError,

  // 类型
  type AIRequestConfig,
  type RequestConfig,
  type ResponseData,
  type StreamChunk,
} from './ai-request';

// Query Builder - 请求构建
export {
  ArgsBuilder,
  buildArgs,
  buildHeaders,
  buildOpenAIHeaders,
  QueryBuilder,
  buildQueryString,
  type ArgType,
  type ArgDefinition,
  type ArgSchema,
  type BuildOptions,
  type HeadersConfig,
  type OpenAIHeadersConfig,
} from './query_build';

// Tokenize - Token 处理
export {
  tokenize,
  estimateTokenCount,
  estimateGPTTokens,
  truncateToTokenCount,
  splitToChunks,
  countTotalTokens,
  formatTokenCount,
  TokenBudget,
  TextEncoder,
  type TokenizeOptions,
  type TokenCountResult,
} from './tokenize';
