/**
 * AI Development Framework
 * 模块化开发框架 - 统一入口
 * 
 * 框架采用模块化设计，各子模块通过各自的 index.ts 导出。
 * 此文件只导出常用的快捷函数，完整功能请从各子模块导入。
 * 
 * @example
 * // 使用快捷函数
 * import { initFramework, createOpenAI, initDatabase } from './framework';
 * 
 * // 使用特定模块
 * import { FrameworkCore } from './framework/ai';
 * import { StorageManager } from './framework/storages';
 */

// ==================== 快捷函数 ====================
export {
  // AI Core
  createCore,
  createOpenAI,
  initOpenAICore,
  
  // Memory
  initMemory,
  
  // Storage
  initStorage,
  createOPFS,
  createLocalStorage,
  createMemoryStorage,
  
  // Request
  initRequestManager,
  createFetchAdapter,
  
  // IndexedDB
  initDatabase,
  defineModel,
  
  // Schema 快捷定义
  field,
  f,
  defineSchema,
  
  // State
  initStore,
  defineSlice,

  // Providers
  createProvider,
  initOpenAI as initOpenAIProvider,

  // Utils
  initEventBus,
  initWorker,
  initWorkerPool,

  // Compression
  initCompression,

  // 组合初始化
  initFramework,
} from './helper';

// ==================== 类型导出 ====================
export type {
  // AI 类型
  CoreConfig,
  ExecuteOptions,
  AIResponse,
  AIStreamChunk,
  AIMessage,
  ToolCall,
  TokenUsage,
  ResponseBuilderOptions,
  AIRequestConfig,
  
  // Provider 类型
  OpenAICompatibleConfig,
  Provider,
  ProviderRequest,
  ProviderStorageItem,
  ThinkingArgs,
} from './ai';

export type {
  // Storage 类型
  IStorage,
  StorageType,
  StorageValue,
  StorageEntry,
  StorageConfig,
  StorageQueryOptions,
  StorageStats,
  StorageManagerConfig,
} from './storages';

export type {
  // Request 类型
  IRequestAdapter,
  RequestConfig,
  ResponseData,
  StreamChunk,
  ExternalRequestInterface,
  RequestManagerConfig,
} from './requests';

export type {
  // IndexedDB 类型
  FieldType,
  FieldDefinition,
  ModelSchema,
  ModelData,
  FilterCondition,
  QueryOptions,
  MigrationVersion,
  DatabaseConfig,
  DatabaseStats,
  BatchResult,
} from './indexeddb';

export type {
  // Memory 类型
  MemoryConfig,
  MemoryEntry,
  MemoryQueryOptions,
} from './memory';

export type {
  // Agent 类型
  AgentConfig,
  AgentState,
  AgentMessage,
  AgentToolCall,
  AgentToolResult,
  AgentExecuteResult,
  AgentTool,
  AgentStep,
  AgentHooks,
  AgentRuntimeConfig,
} from './agent';

export type {
  // State 类型
  StateSubscriber,
  StateSelector,
  StateUpdater,
  StateAction,
  StateReducer,
  StateConfig,
  StateSlice,
  StoreAPI,
  StateChangeInfo,
  StateHooks,
} from './state';

export type {
  // Utils 类型
  EventHandler,
  EventOptions,
  WorkerOptions,
  WorkerPoolOptions,
} from './utils';

export type {
  // Compression 类型
  CompressionOptions,
  CompressionResult,
} from './storages';

// ==================== 模块重导出 ====================
export { Store } from './state';
export { EventBus, WorkerManager } from './utils';
export { Compression } from './storages';
