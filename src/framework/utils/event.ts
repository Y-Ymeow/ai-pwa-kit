/**
 * EventBus - 事件总线
 * 
 * 提供全局和局部的事件订阅/发布功能
 * 支持命名空间、一次性订阅、优先级等特性
 * 
 * @example
 * ```typescript
 * // 全局事件总线
 * const events = createEventBus();
 * 
 * // 订阅事件
 * events.on('user:login', (user) => {
 *   console.log('用户登录:', user);
 * });
 * 
 * // 订阅一次
 * events.once('app:ready', () => {
 *   console.log('应用就绪');
 * });
 * 
 * // 触发事件
 * events.emit('user:login', { id: 1, name: '张三' });
 * 
 * // 取消订阅
 * const unsubscribe = events.on('data:update', handler);
 * unsubscribe();
 * ```
 */

/**
 * 事件处理器类型
 */
export type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

/**
 * 事件订阅选项
 */
export interface EventOptions {
  /** 优先级（数字越小优先级越高） */
  priority?: number;
  /** 命名空间 */
  namespace?: string;
}

/**
 * 事件订阅信息
 */
interface EventSubscription<T = unknown> {
  handler: EventHandler<T>;
  once: boolean;
  priority: number;
  namespace?: string;
  id: string;
}

/**
 * 事件总线类
 */
export class EventBus {
  private events = new Map<string, EventSubscription<any>[]>();
  private globalNamespace?: string;
  private idCounter = 0;

  /**
   * 创建事件总线
   * @param namespace 全局命名空间（可选）
   */
  constructor(namespace?: string) {
    this.globalNamespace = namespace;
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `${Date.now()}-${++this.idCounter}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取完整事件名（带命名空间）
   */
  private getFullEventName(event: string, namespace?: string): string {
    const ns = namespace || this.globalNamespace;
    return ns ? `${ns}:${event}` : event;
  }

  /**
   * 订阅事件
   * 
   * @param event 事件名称
   * @param handler 事件处理器
   * @param options 选项
   * @returns 取消订阅函数
   * 
   * @example
   * ```typescript
   * const unsubscribe = events.on('user:login', (user) => {
   *   console.log(user);
   * });
   * 
   * // 之后取消订阅
   * unsubscribe();
   * ```
   */
  on<T = unknown>(
    event: string,
    handler: EventHandler<T>,
    options: EventOptions = {}
  ): () => void {
    const fullEvent = this.getFullEventName(event, options.namespace);
    
    if (!this.events.has(fullEvent)) {
      this.events.set(fullEvent, []);
    }

    const subscription: EventSubscription<T> = {
      handler,
      once: false,
      priority: options.priority ?? 0,
      namespace: options.namespace,
      id: this.generateId(),
    };

    const subscriptions = this.events.get(fullEvent)!;
    subscriptions.push(subscription);
    
    // 按优先级排序
    subscriptions.sort((a, b) => a.priority - b.priority);

    // 返回取消订阅函数
    return () => {
      this.off(event, handler, options.namespace);
    };
  }

  /**
   * 订阅事件（只触发一次）
   * 
   * @param event 事件名称
   * @param handler 事件处理器
   * @param options 选项
   * @returns 取消订阅函数
   * 
   * @example
   * ```typescript
   * events.once('app:ready', () => {
   *   console.log('应用已就绪');
   * });
   * ```
   */
  once<T = unknown>(
    event: string,
    handler: EventHandler<T>,
    options: Omit<EventOptions, 'priority'> = {}
  ): () => void {
    const fullEvent = this.getFullEventName(event, options.namespace);
    
    if (!this.events.has(fullEvent)) {
      this.events.set(fullEvent, []);
    }

    const subscription: EventSubscription<T> = {
      handler,
      once: true,
      priority: 0,
      namespace: options.namespace,
      id: this.generateId(),
    };

    const subscriptions = this.events.get(fullEvent)!;
    subscriptions.push(subscription);

    return () => {
      this.off(event, handler, options.namespace);
    };
  }

  /**
   * 取消订阅
   * 
   * @param event 事件名称
   * @param handler 事件处理器（可选，不传则取消所有）
   * @param namespace 命名空间
   */
  off(event: string, handler?: EventHandler<any>, namespace?: string): void {
    const fullEvent = this.getFullEventName(event, namespace);
    const subscriptions = this.events.get(fullEvent);

    if (!subscriptions) return;

    if (handler) {
      const index = subscriptions.findIndex((sub) => sub.handler === handler);
      if (index > -1) {
        subscriptions.splice(index, 1);
      }
    } else {
      // 取消所有订阅
      this.events.delete(fullEvent);
    }
  }

  /**
   * 触发事件
   * 
   * @param event 事件名称
   * @param payload 事件数据
   * @param namespace 命名空间
   * @returns Promise（所有处理器执行完成）
   * 
   * @example
   * ```typescript
   * await events.emit('user:login', { id: 1, name: '张三' });
   * ```
   */
  async emit<T = unknown>(event: string, payload?: T, namespace?: string): Promise<void> {
    const fullEvent = this.getFullEventName(event, namespace);
    const subscriptions = this.events.get(fullEvent);

    if (!subscriptions || subscriptions.length === 0) {
      return;
    }

    // 复制数组以避免在迭代时修改
    const toRemove: EventSubscription<any>[] = [];

    for (const subscription of [...subscriptions]) {
      try {
        await subscription.handler(payload);
        
        if (subscription.once) {
          toRemove.push(subscription);
        }
      } catch (error) {
        console.error(`Event handler error for "${event}":`, error);
      }
    }

    // 移除一次性订阅
    for (const sub of toRemove) {
      const index = subscriptions.findIndex((s) => s.id === sub.id);
      if (index > -1) {
        subscriptions.splice(index, 1);
      }
    }
  }

  /**
   * 同步触发事件（不等待处理器完成）
   * 
   * @param event 事件名称
   * @param payload 事件数据
   * @param namespace 命名空间
   */
  emitSync<T = unknown>(event: string, payload?: T, namespace?: string): void {
    // 异步执行但不等待
    this.emit(event, payload, namespace).catch((error) => {
      console.error(`Event emit error for "${event}":`, error);
    });
  }

  /**
   * 监听所有事件（通配符）
   * 
   * @param handler 事件处理器
   * @returns 取消监听函数
   */
  onAll(handler: (event: string, payload: unknown) => void): () => void {
    const wildcardHandler = (event: string, payload: unknown) => {
      handler(event, payload);
    };

    // 订阅所有事件
    const unsubscribe = this.on('*', wildcardHandler as EventHandler);
    return unsubscribe;
  }

  /**
   * 获取事件订阅数量
   * 
   * @param event 事件名称
   * @param namespace 命名空间
   */
  listenerCount(event: string, namespace?: string): number {
    const fullEvent = this.getFullEventName(event, namespace);
    return this.events.get(fullEvent)?.length || 0;
  }

  /**
   * 获取所有事件名称
   */
  eventNames(): string[] {
    return Array.from(this.events.keys());
  }

  /**
   * 清空所有事件订阅
   * 
   * @param namespace 指定命名空间（不传则清空所有）
   */
  clear(namespace?: string): void {
    if (namespace) {
      // 清空指定命名空间的事件
      for (const [key] of this.events) {
        if (key.startsWith(`${namespace}:`)) {
          this.events.delete(key);
        }
      }
    } else {
      this.events.clear();
    }
  }

  /**
   * 等待指定事件触发
   * 
   * @param event 事件名称
   * @param timeout 超时时间（毫秒）
   * @param namespace 命名空间
   * @returns Promise
   * 
   * @example
   * ```typescript
   * const user = await events.waitFor('user:login', 5000);
   * ```
   */
  waitFor<T = unknown>(
    event: string,
    timeout?: number,
    namespace?: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.once<T>(event, (payload) => {
        resolve(payload);
      }, { namespace });

      if (timeout) {
        setTimeout(() => {
          unsubscribe();
          reject(new Error(`Event "${event}" timeout after ${timeout}ms`));
        }, timeout);
      }
    });
  }
}

// ==================== 快捷函数 ====================

/**
 * 创建事件总线
 * 
 * @param namespace 命名空间
 * @returns EventBus 实例
 * 
 * @example
 * ```typescript
 * // 全局事件总线
 * const events = createEventBus();
 * 
 * // 带命名空间的事件总线
 * const userEvents = createEventBus('user');
 * userEvents.on('login', handler); // 订阅 user:login
 * ```
 */
export function createEventBus(namespace?: string): EventBus {
  return new EventBus(namespace);
}

/**
 * 全局事件总线实例
 */
let globalEventBus: EventBus | null = null;

/**
 * 获取全局事件总线
 */
export function getGlobalEventBus(): EventBus {
  if (!globalEventBus) {
    globalEventBus = new EventBus();
  }
  return globalEventBus;
}

/**
 * 设置全局事件总线
 */
export function setGlobalEventBus(bus: EventBus): void {
  globalEventBus = bus;
}

// 默认导出
export default EventBus;
