/**
 * State Store
 * 跨框架全局状态管理核心
 */

import type {
  StateConfig,
  StoreAPI,
  StateSubscriber,
  StateSelector,
  StateUpdater,
  StateAction,
  StateChangeInfo,
  StateHooks,
  PersistStorage,
} from './types';

/**
 * 创建 LocalStorage 持久化存储
 */
function createLocalStorage(): PersistStorage {
  return {
    async getItem(key: string): Promise<string | null> {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    async setItem(key: string, value: string): Promise<void> {
      try {
        localStorage.setItem(key, value);
      } catch {
        // 忽略存储错误
      }
    },
    async removeItem(key: string): Promise<void> {
      try {
        localStorage.removeItem(key);
      } catch {
        // 忽略存储错误
      }
    },
  };
}

/**
 * 创建 SessionStorage 持久化存储
 */
function createSessionStorage(): PersistStorage {
  return {
    async getItem(key: string): Promise<string | null> {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    async setItem(key: string, value: string): Promise<void> {
      try {
        sessionStorage.setItem(key, value);
      } catch {
        // 忽略存储错误
      }
    },
    async removeItem(key: string): Promise<void> {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // 忽略存储错误
      }
    },
  };
}

/**
 * 创建内存存储（用于不支持 storage 的环境）
 */
function createMemoryStorage(): PersistStorage {
  const store = new Map<string, string>();
  return {
    async getItem(key: string): Promise<string | null> {
      return store.get(key) || null;
    },
    async setItem(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

/**
 * 获取持久化存储
 */
function getPersistStorage(
  mode: 'localStorage' | 'sessionStorage' | 'indexedDB' | 'memory'
): PersistStorage {
  switch (mode) {
    case 'localStorage':
      return createLocalStorage();
    case 'sessionStorage':
      return createSessionStorage();
    case 'memory':
    default:
      return createMemoryStorage();
  }
}

/**
 * 深度克隆
 */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
  if (Array.isArray(obj)) return obj.map(deepClone) as unknown as T;
  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * 深度比较
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  
  return true;
}

/**
 * 获取对象差异键
 */
function getChangedKeys<T>(oldState: T, newState: T): string[] {
  const keys = new Set<string>();
  const allKeys = new Set([
    ...Object.keys(oldState as object),
    ...Object.keys(newState as object),
  ]);
  
  for (const key of allKeys) {
    const oldVal = (oldState as Record<string, unknown>)[key];
    const newVal = (newState as Record<string, unknown>)[key];
    if (!deepEqual(oldVal, newVal)) {
      keys.add(key);
    }
  }
  
  return Array.from(keys);
}

/**
 * Store 类
 * 跨框架状态管理核心实现
 */
export class Store<T extends Record<string, unknown>> implements StoreAPI<T> {
  private state: T;
  private initialState: T;
  private subscribers: Set<StateSubscriber<T>> = new Set();
  private config: StateConfig<T>;
  private storage: PersistStorage | null = null;
  private hooks: StateHooks<T>;
  private reducers: Map<string, (state: T, payload: unknown) => T> = new Map();
  private isDestroyed = false;
  private batchQueue: Array<() => void> = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: StateConfig<T>, hooks: StateHooks<T> = {}) {
    this.config = {
      persist: false,
      persistMode: 'localStorage',
      ...config,
    };
    this.hooks = hooks;
    
    // 初始化存储
    if (this.config.persist) {
      this.storage = getPersistStorage(this.config.persistMode || 'localStorage');
    }
    
    // 加载或初始化状态
    this.initialState = deepClone(config.initialState);
    this.state = this.initialState;
    
    // 异步加载持久化数据
    this.loadPersistedState();
    
    // 触发初始化钩子
    this.hooks.onInit?.(this.state);
  }

  /**
   * 加载持久化状态
   */
  private async loadPersistedState(): Promise<void> {
    if (!this.storage || !this.config.persistKey) return;
    
    try {
      const data = await this.storage.getItem(this.config.persistKey);
      if (data) {
        const parsed = this.config.transform?.deserialize
          ? this.config.transform.deserialize(data)
          : JSON.parse(data);
        
        // 验证状态
        if (this.config.validate) {
          const valid = this.config.validate(parsed);
          if (valid === true || typeof valid !== 'string') {
            this.state = { ...this.initialState, ...parsed };
          }
        } else {
          this.state = { ...this.initialState, ...parsed };
        }
        
        this.notifySubscribers(this.state, this.initialState);
      }
    } catch (error) {
      console.error('[Store] Failed to load persisted state:', error);
    }
  }

  /**
   * 保存持久化状态
   */
  private async savePersistedState(): Promise<void> {
    if (!this.storage || !this.config.persistKey || this.isDestroyed) return;
    
    try {
      const data = this.config.transform?.serialize
        ? this.config.transform.serialize(this.state)
        : JSON.stringify(this.state);
      
      await this.storage.setItem(this.config.persistKey, data);
    } catch (error) {
      console.error('[Store] Failed to save persisted state:', error);
    }
  }

  /**
   * 获取当前状态
   */
  getState(): T {
    return deepClone(this.state);
  }

  /**
   * 设置状态
   */
  setState(updater: StateUpdater<T> | Partial<T>): void {
    if (this.isDestroyed) {
      throw new Error('Store has been destroyed');
    }

    const oldState = this.state;
    let newState: T;

    if (typeof updater === 'function') {
      newState = (updater as StateUpdater<T>)(deepClone(oldState));
    } else {
      newState = { ...oldState, ...updater } as T;
    }

    // 验证状态
    if (this.config.validate) {
      const valid = this.config.validate(newState);
      if (valid !== true && typeof valid === 'string') {
        throw new Error(`State validation failed: ${valid}`);
      }
    }

    // 触发 beforeChange 钩子
    const changeInfo: StateChangeInfo<T> = {
      newState,
      oldState,
      changedKeys: getChangedKeys(oldState, newState),
      timestamp: Date.now(),
    };

    const shouldChange = this.hooks.beforeChange?.(changeInfo);
    if (shouldChange === false) return;

    // 更新状态
    this.state = newState;

    // 保存持久化
    this.savePersistedState();

    // 触发 afterChange 钩子
    this.hooks.afterChange?.(changeInfo);

    // 通知订阅者
    this.notifySubscribers(newState, oldState);
  }

  /**
   * 批量更新状态
   */
  batchUpdate(updates: Array<() => void>): void {
    updates.forEach((update) => this.batchQueue.push(update));
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    
    this.batchTimer = setTimeout(() => {
      const oldState = this.state;
      
      // 执行所有更新
      while (this.batchQueue.length > 0) {
        const update = this.batchQueue.shift();
        update?.();
      }
      
      // 只通知一次
      if (this.state !== oldState) {
        this.notifySubscribers(this.state, oldState);
        this.savePersistedState();
      }
    }, 0);
  }

  /**
   * 通知订阅者
   */
  private notifySubscribers(newState: T, oldState: T): void {
    this.subscribers.forEach((subscriber) => {
      try {
        subscriber(deepClone(newState), deepClone(oldState));
      } catch (error) {
        console.error('[Store] Subscriber error:', error);
      }
    });
  }

  /**
   * 订阅状态变化
   */
  subscribe(subscriber: StateSubscriber<T>): () => void {
    this.subscribers.add(subscriber);
    
    // 立即执行一次，获取当前状态
    subscriber(deepClone(this.state), deepClone(this.state));
    
    // 返回取消订阅函数
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  /**
   * 取消订阅
   */
  unsubscribe(subscriber: StateSubscriber<T>): void {
    this.subscribers.delete(subscriber);
  }

  /**
   * 分发 Action
   */
  dispatch(action: StateAction): void {
    const reducer = this.reducers.get(action.type);
    if (reducer) {
      this.setState((prevState) => reducer(prevState, action.payload));
    } else {
      console.warn(`[Store] No reducer found for action: ${action.type}`);
    }
  }

  /**
   * 注册 Reducer
   */
  registerReducer(type: string, reducer: (state: T, payload: unknown) => T): void {
    this.reducers.set(type, reducer);
  }

  /**
   * 选择状态片段
   */
  select<R>(selector: StateSelector<T, R>): R {
    return selector(deepClone(this.state));
  }

  /**
   * 监听特定路径
   */
  watch<K extends keyof T>(key: K, callback: StateSubscriber<T[K]>): () => void {
    let lastValue = deepClone(this.state[key]);
    
    const unsubscribe = this.subscribe((newState) => {
      const newValue = newState[key];
      if (!deepEqual(lastValue, newValue)) {
        lastValue = deepClone(newValue);
        callback(newValue, lastValue);
      }
    });
    
    return unsubscribe;
  }

  /**
   * 重置状态
   */
  reset(): void {
    const oldState = this.state;
    this.state = deepClone(this.initialState);
    
    this.hooks.onReset?.();
    this.notifySubscribers(this.state, oldState);
    this.savePersistedState();
  }

  /**
   * 销毁 Store
   */
  destroy(): void {
    this.isDestroyed = true;
    this.subscribers.clear();
    this.reducers.clear();
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    
    this.hooks.onDestroy?.();
  }

  /**
   * 检查是否已销毁
   */
  isAlive(): boolean {
    return !this.isDestroyed;
  }
}

/**
 * 创建 Store 工厂函数
 */
export function createStore<T extends Record<string, unknown>>(
  config: StateConfig<T>,
  hooks?: StateHooks<T>
): Store<T> {
  return new Store(config, hooks);
}

/**
 * 全局 Store 注册表
 */
const globalStores = new Map<string, Store<Record<string, unknown>>>();

/**
 * 获取或创建全局 Store
 */
export function getGlobalStore<T extends Record<string, unknown>>(
  name: string,
  config?: StateConfig<T>
): Store<T> {
  if (!globalStores.has(name) && config) {
    globalStores.set(name, new Store(config) as Store<Record<string, unknown>>);
  }
  return globalStores.get(name) as Store<T>;
}

/**
 * 移除全局 Store
 */
export function removeGlobalStore(name: string): void {
  const store = globalStores.get(name);
  if (store) {
    store.destroy();
    globalStores.delete(name);
  }
}

/**
 * 列出所有全局 Store 名称
 */
export function listGlobalStores(): string[] {
  return Array.from(globalStores.keys());
}
