/**
 * Framework Helper Functions
 * 框架快捷创建函数
 * 
 * 提供常用的工厂函数和便捷方法，简化框架使用
 */

import { FrameworkCore } from './ai/core';
import { OpenAIProvider } from './ai/providers/openai';
import {
  ProviderStorage,
  createProvider,
  createOpenAI,
  OpenAICompatibleProvider,
} from './ai/providers';
import { Memory } from './memory';
import { StorageManager, OPFSStorage, LocalStorage, MemoryStorage } from './storages';
import { RequestManager, FetchAdapter, createAutoExternalAdapter } from './requests';
import { IDBDatabase, Model, field, defineSchema } from './indexeddb';
import { Agent, createAgent, createAgentFromPreset } from './agent';
import { Store, createStore, getGlobalStore, createSlice, counterSlice, userSlice, themeSlice } from './state';
import { EventBus, WorkerManager, createEventBus, createWorker, createWorkerPool } from './utils';
import { Compression, createCompression, compressText, decompressText, compressObject, decompressObject } from './storages';

import type { CoreConfig } from './ai/core';
import type { OpenAIConfig } from './ai/providers/openai';
import type { OpenAICompatibleConfig } from './ai/providers';
import type { MemoryConfig } from './memory';
import type { StorageManagerConfig } from './storages';
import type { RequestManagerConfig } from './requests';
import type { DatabaseConfig, ModelSchema } from './indexeddb';
import type { AgentConfig, AgentHooks } from './agent';
import type { StateConfig, StateHooks } from './state';
import type { EventHandler, EventOptions, WorkerOptions, WorkerPoolOptions } from './utils';
import type { CompressionOptions, CompressionResult } from './storages';

// ==================== AI Core ====================

/**
 * 创建框架核心实例
 * @param config 核心配置
 * @param storage Provider 存储
 */
export function createCore(config?: CoreConfig, storage?: ProviderStorage): FrameworkCore {
  return new FrameworkCore(config, storage);
}

/**
 * 创建 OpenAI Provider
 * @param config Provider 配置
 */
export function createOpenAI(config: Omit<OpenAIConfig, 'type'>): OpenAIProvider {
  return new OpenAIProvider({
    type: 'openai',
    ...config,
  } as OpenAIConfig);
}

/**
 * 快速初始化 OpenAI 核心
 * @param apiKey API 密钥
 * @param options 其他选项
 */
export function initOpenAICore(
  apiKey: string,
  options?: {
    model?: string;
    timeout?: number;
  }
): FrameworkCore {
  const core = createCore({ 
    defaultProvider: 'openai',
    timeout: options?.timeout 
  });
  
  const provider = createOpenAI({
    name: 'openai',
    apiKey,
    model: options?.model,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  
  core.registerProvider('openai', provider);
  return core;
}

// ==================== Memory ====================

/**
 * 创建记忆系统实例
 * @param config 记忆配置
 */
export function initMemory(config?: MemoryConfig): Memory {
  const memory = new Memory(config);
  return memory;
}

// ==================== Storage ====================

/**
 * 创建存储管理器
 * @param config 存储配置
 */
export function initStorage(config?: StorageManagerConfig): StorageManager {
  return new StorageManager(config);
}

/**
 * 创建 OPFS 存储
 * @param name 存储名称
 */
export function createOPFS(name: string = 'app-storage'): OPFSStorage {
  return new OPFSStorage(name);
}

/**
 * 创建 LocalStorage 存储
 * @param name 存储名称
 */
export function createLocalStorage(name: string = 'app-storage'): LocalStorage {
  return new LocalStorage(name);
}

/**
 * 创建内存存储
 * @param name 存储名称
 */
export function createMemoryStorage(name: string = 'app-storage'): MemoryStorage {
  return new MemoryStorage(name);
}

// ==================== Request ====================

/**
 * 创建请求管理器
 * @param config 请求配置
 */
export function initRequestManager(config?: RequestManagerConfig): RequestManager {
  const manager = new RequestManager(config);
  
  // 尝试自动注册外部适配器
  const externalAdapter = createAutoExternalAdapter();
  if (externalAdapter) {
    manager.register(externalAdapter);
  }
  
  return manager;
}

/**
 * 创建 Fetch 适配器
 */
export function createFetchAdapter(): FetchAdapter {
  return new FetchAdapter();
}

// ==================== IndexedDB ====================

/**
 * 创建 IndexedDB 数据库
 * @param config 数据库配置
 */
export function initDatabase(config: DatabaseConfig): IDBDatabase {
  return new IDBDatabase(config);
}

/**
 * 创建 IndexedDB 模型
 * @param db 数据库实例
 * @param name 模型名称
 * @param schema 字段定义
 */
export function defineModel<T extends Record<string, unknown>>(
  db: IDBDatabase,
  name: string,
  schema: ModelSchema
): Model<T> {
  return new Model<T>(db, name, schema);
}

// ==================== Schema 快捷定义 ====================

/**
 * Schema 字段定义
 */
export const f = {
  /** 主键（自增数字） */
  id: () => field.primary(),
  
  /** UUID 主键 */
  uuid: () => field.uuid(),
  
  /** 字符串 */
  string: (options?: { required?: boolean; default?: string }) => 
    field.string({ required: options?.required, default: options?.default }),
  
  /** 数字 */
  number: (options?: { required?: boolean; default?: number }) => 
    field.number({ required: options?.required, default: options?.default }),
  
  /** 布尔值 */
  boolean: (options?: { required?: boolean; default?: boolean }) => 
    field.boolean({ required: options?.required, default: options?.default }),
  
  /** 日期 */
  date: (options?: { required?: boolean; default?: () => Date }) => 
    field.date({ required: options?.required, default: options?.default }),
  
  /** 数组 */
  array: (options?: { required?: boolean }) => 
    field.array({ required: options?.required }),
  
  /** JSON */
  json: (options?: { required?: boolean }) => 
    field.json({ required: options?.required }),
  
  /** 对象 */
  object: (options?: { required?: boolean }) => 
    field.object({ required: options?.required }),
};

// ==================== 组合初始化 ====================

/**
 * 初始化完整的 AI 框架
 * @param options 配置选项
 */
export function initFramework(options: {
  openai?: { apiKey: string; model?: string };
  storage?: { type: 'opfs' | 'localStorage' | 'memory'; name?: string };
  indexedDB?: { name: string; version: number };
}): {
  core: FrameworkCore;
  storage: StorageManager;
  requests: RequestManager;
  db?: IDBDatabase;
} {
  // 初始化核心
  const core = options.openai 
    ? initOpenAICore(options.openai.apiKey, { model: options.openai.model })
    : createCore();

  // 初始化存储
  const storageType = options.storage?.type || 'localStorage';
  const storageName = options.storage?.name || 'app-storage';
  
  const storage = new StorageManager({ defaultStorage: storageType });
  
  // 初始化请求管理器
  const requests = initRequestManager();

  // 初始化 IndexedDB（可选）
  let db: IDBDatabase | undefined;
  if (options.indexedDB) {
    db = initDatabase(options.indexedDB);
  }

  return { core, storage, requests, db };
}

// 重新导出 field 和 defineSchema
export { field, defineSchema };

// ==================== Agent ====================

/**
 * 创建 Agent
 * @param core 框架核心
 * @param config Agent 配置
 * @param hooks Agent 钩子
 */
export function initAgent(
  core: FrameworkCore,
  config: AgentConfig,
  hooks?: AgentHooks
): Agent {
  return createAgent(core, config, hooks);
}

/**
 * 从预设创建 Agent
 * @param core 框架核心
 * @param presetName 预设名称
 * @param customConfig 自定义配置
 * @param hooks Agent 钩子
 */
export function initAgentFromPreset(
  core: FrameworkCore,
  presetName: string,
  customConfig?: Partial<AgentConfig>,
  hooks?: AgentHooks
): Agent | null {
  return createAgentFromPreset(core, presetName, customConfig, hooks);
}

/**
 * 快速创建代码助手 Agent
 * @param core 框架核心
 * @param hooks Agent 钩子
 */
export function createCoderAgent(core: FrameworkCore, hooks?: AgentHooks): Agent {
  return createAgentFromPreset(core, 'coder', {}, hooks)!;
}

/**
 * 快速创建研究助手 Agent
 * @param core 框架核心
 * @param hooks Agent 钩子
 */
export function createResearcherAgent(core: FrameworkCore, hooks?: AgentHooks): Agent {
  return createAgentFromPreset(core, 'researcher', {}, hooks)!;
}

// ==================== State ====================

/**
 * 创建状态管理器
 * @param config 状态配置
 */
export function initStore<TState>(config?: StateConfig<TState>): Store<TState> {
  return createStore(config);
}

/**
 * 获取全局状态管理器实例
 * @param name 实例名称
 */
export function getGlobalStoreInstance(name: string = 'default'): Store | undefined {
  return getGlobalStore(name);
}

/**
 * 创建状态切片
 * @param name 切片名称
 * @param initialState 初始状态
 * @param reducers Reducer 函数
 */
export function defineSlice<TState, TActions extends Record<string, (state: TState, payload?: unknown) => TState>>(
  name: string,
  initialState: TState,
  reducers: TActions
) {
  return createSlice(name, initialState, reducers);
}

// ==================== Providers ====================

// ==================== Providers ====================

/**
 * 创建 OpenAI 兼容 Provider
 * 
 * 通用工厂函数，支持任何 OpenAI API 兼容的服务商
 * 
 * @example
 * ```typescript
 * // OpenAI
 * const openai = createProvider({
 *   name: 'openai',
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: 'gpt-4o'
 * });
 * 
 * // DeepSeek
 * const deepseek = createProvider({
 *   name: 'deepseek',
 *   apiKey: process.env.DEEPSEEK_API_KEY,
 *   baseUrl: 'https://api.deepseek.com/v1',
 *   model: 'deepseek-chat'
 * });
 * 
 * // 智谱 AI
 * const zhipu = createProvider({
 *   name: 'zhipu',
 *   apiKey: process.env.ZHIPU_API_KEY,
 *   baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
 *   model: 'glm-4'
 * });
 * 
 * // 使用
 * const response = await deepseek.request({
 *   messages: [{ role: 'user', content: 'Hello' }]
 * });
 * ```
 */
export { createProvider };

/**
 * 快速创建 OpenAI Provider
 * 
 * @param apiKey OpenAI API Key
 * @param options 可选配置
 */
export function initOpenAI(
  apiKey: string,
  options?: {
    model?: string;
    organization?: string;
    project?: string;
  }
) {
  return createOpenAI(apiKey, options);
}

// 重新导出
export {
  // 类
  OpenAICompatibleProvider,
  // 工厂方法
  createOpenAI,
};

// ==================== Utils ====================

/**
 * 创建事件总线
 * @param namespace 命名空间
 */
export function initEventBus(namespace?: string): EventBus {
  return createEventBus(namespace);
}

/**
 * 创建 Worker
 * @param fn Worker 函数
 * @param options 选项
 */
export function initWorker(fn: (ctx: Worker) => void, options?: WorkerOptions): WorkerManager {
  return createWorker(fn, options);
}

/**
 * 创建 Worker 池
 * @param script Worker 脚本
 * @param options 池选项
 */
export function initWorkerPool(
  script: string | ((ctx: Worker) => void),
  options: WorkerPoolOptions
) {
  return createWorkerPool(script, options);
}

// 重新导出 Utils
export {
  EventBus,
  WorkerManager,
  createEventBus,
  getGlobalEventBus,
  createWorker,
  createWorkerPool,
};

// ==================== Compression ====================

/**
 * 创建压缩实例
 * @param options 压缩选项
 */
export function initCompression(options?: CompressionOptions): Compression {
  return createCompression(options);
}

// 重新导出 Compression
export {
  Compression,
  createCompression,
  compressText,
  decompressText,
  compressObject,
  decompressObject,
};
