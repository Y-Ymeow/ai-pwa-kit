/**
 * State Management Types
 * 全局状态管理类型定义
 */

/**
 * 状态订阅者
 */
export type StateSubscriber<T = unknown> = (newState: T, oldState: T) => void;

/**
 * 状态选择器
 */
export type StateSelector<T, R> = (state: T) => R;

/**
 * 状态更新函数
 */
export type StateUpdater<T> = (prevState: T) => T;

/**
 * 状态操作
 */
export type StateAction<T = unknown> = {
  type: string;
  payload?: T;
};

/**
 * 状态处理器
 */
export type StateReducer<S, A = StateAction> = (state: S, action: A) => S;

/**
 * 状态中间件
 */
export type StateMiddleware<S> = (
  store: StoreAPI<S>
) => (next: (action: StateAction) => void) => (action: StateAction) => void;

/**
 * 状态配置
 */
export interface StateConfig<T> {
  /** 初始状态 */
  initialState: T;
  /** 是否持久化 */
  persist?: boolean;
  /** 持久化键名 */
  persistKey?: string;
  /** 持久化方式 */
  persistMode?: 'localStorage' | 'sessionStorage' | 'indexedDB' | 'memory';
  /** 状态验证 */
  validate?: (state: T) => boolean | string;
  /** 状态转换 */
  transform?: {
    serialize?: (state: T) => string;
    deserialize?: (data: string) => T;
  };
}

/**
 * 状态切片
 */
export interface StateSlice<T = unknown> {
  /** 切片名称 */
  name: string;
  /** 初始状态 */
  initialState: T;
  /** Reducers */
  reducers?: Record<string, (state: T, payload: unknown) => T>;
  /** Actions */
  actions?: Record<string, (payload: unknown) => StateAction>;
}

/**
 * Store API
 */
export interface StoreAPI<T> {
  /** 获取当前状态 */
  getState(): T;
  /** 设置状态 */
  setState(updater: StateUpdater<T> | Partial<T>): void;
  /** 订阅状态变化 */
  subscribe(subscriber: StateSubscriber<T>): () => void;
  /** 取消订阅 */
  unsubscribe(subscriber: StateSubscriber<T>): void;
  /** 分发 Action */
  dispatch(action: StateAction): void;
  /** 选择状态片段 */
  select<R>(selector: StateSelector<T, R>): R;
  /** 监听特定路径 */
  watch<K extends keyof T>(key: K, callback: StateSubscriber<T[K]>): () => void;
  /** 重置状态 */
  reset(): void;
  /** 销毁 Store */
  destroy(): void;
}

/**
 * 全局状态管理器配置
 */
export interface GlobalStateConfig {
  /** 是否启用开发工具 */
  devTools?: boolean;
  /** 中间件列表 */
  middlewares?: StateMiddleware<unknown>[];
  /** 默认持久化配置 */
  defaultPersist?: boolean;
  /** 默认持久化方式 */
  defaultPersistMode?: StateConfig<unknown>['persistMode'];
}

/**
 * 状态变化信息
 */
export interface StateChangeInfo<T> {
  /** 新状态 */
  newState: T;
  /** 旧状态 */
  oldState: T;
  /** 变化的键 */
  changedKeys: string[];
  /** 时间戳 */
  timestamp: number;
  /** Action 类型 */
  actionType?: string;
}

/**
 * 持久化存储接口
 */
export interface PersistStorage {
  /** 获取数据 */
  getItem(key: string): Promise<string | null>;
  /** 设置数据 */
  setItem(key: string, value: string): Promise<void>;
  /** 删除数据 */
  removeItem(key: string): Promise<void>;
}

/**
 * 状态钩子
 */
export interface StateHooks<T> {
  /** 状态改变前 */
  beforeChange?: (info: StateChangeInfo<T>) => void | boolean;
  /** 状态改变后 */
  afterChange?: (info: StateChangeInfo<T>) => void;
  /** 状态初始化 */
  onInit?: (state: T) => void;
  /** 状态重置 */
  onReset?: () => void;
  /** 状态销毁 */
  onDestroy?: () => void;
}

/**
 * 派生状态配置
 */
export interface DerivedStateConfig<T, D> {
  /** 依赖的状态键 */
  deps: (keyof T)[];
  /** 计算函数 */
  compute: (state: T) => D;
  /** 是否缓存 */
  cache?: boolean;
  /** 比较函数 */
  equals?: (a: D, b: D) => boolean;
}

/**
 * 状态比较选项
 */
export interface CompareOptions {
  /** 深度比较 */
  deep?: boolean;
  /** 忽略的键 */
  ignoreKeys?: string[];
  /** 严格模式 */
  strict?: boolean;
}

/**
 * 批量更新配置
 */
export interface BatchUpdateConfig {
  /** 是否启用批量更新 */
  enabled?: boolean;
  /** 延迟时间（毫秒） */
  delay?: number;
  /** 最大批量数 */
  maxBatchSize?: number;
}
