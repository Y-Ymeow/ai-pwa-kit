/**
 * Worker Manager - WebWorker 管理器
 *
 * 提供 WebWorker 的创建、管理和通信封装
 * 支持内联 Worker、文件 Worker 和 Worker 池
 *
 * @example
 * ```typescript
 * // 方式一：内联 Worker
 * const worker = createWorker((ctx) => {
 *   ctx.onmessage = (e) => {
 *     const result = heavyComputation(e.data);
 *     ctx.postMessage(result);
 *   };
 * });
 *
 * worker.postMessage({ data: largeArray });
 * worker.onmessage = (e) => console.log(e.data);
 *
 * // 方式二：从文件创建
 * const fileWorker = new WorkerManager('workers/calculator.js');
 * const result = await fileWorker.exec('calculate', { n: 1000000 });
 *
 * // 方式三：Worker 池
 * const pool = new WorkerManager.Pool('workers/processor.js', { size: 4 });
 * const result = await pool.exec(data);
 * ```
 */

/**
 * Worker 消息类型
 */
export interface WorkerMessage<T = unknown> {
  id: string;
  type: string;
  payload: T;
  error?: string;
}

/**
 * Worker 执行选项
 */
export interface WorkerOptions {
  /** Worker 名称 */
  name?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否立即终止 */
  immediateTerminate?: boolean;
}

/**
 * Worker 池选项
 */
export interface WorkerPoolOptions {
  /** 池大小 */
  size: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否复用 Worker */
  reuse?: boolean;
}

/**
 * Worker 管理器
 */
export class WorkerManager {
  private worker: Worker | null = null;
  private url: string;
  private pendingTasks = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();
  private messageHandler: ((e: MessageEvent) => void) | null = null;
  private idCounter = 0;
  private options: WorkerOptions;

  /**
   * 创建 Worker 管理器
   * @param workerScript Worker 脚本路径或内联函数
   * @param options 选项
   */
  constructor(
    workerScript: string | ((ctx: Worker) => void),
    options: WorkerOptions = {},
  ) {
    this.options = options;
    if (typeof workerScript === "string") {
      this.url = workerScript;
      this.worker = new Worker(workerScript, { name: options.name });
    } else {
      // 内联 Worker
      const blob = new Blob([`(${workerScript.toString()})(self)`], {
        type: "application/javascript",
      });
      this.url = URL.createObjectURL(blob);
      this.worker = new Worker(this.url, { name: options.name });
    }

    this.setupMessageHandler();
  }

  /**
   * 设置消息处理器
   */
  private setupMessageHandler(): void {
    this.messageHandler = (e: MessageEvent) => {
      const message = e.data as WorkerMessage;

      if (!message || !message.id) return;

      const task = this.pendingTasks.get(message.id);
      if (!task) return;

      // 清除超时定时器
      if (task.timer) {
        clearTimeout(task.timer);
      }

      // 移除任务
      this.pendingTasks.delete(message.id);

      // 处理结果
      if (message.error) {
        task.reject(new Error(message.error));
      } else {
        task.resolve(message.payload);
      }
    };

    this.worker?.addEventListener("message", this.messageHandler);
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `task-${++this.idCounter}-${Date.now()}`;
  }

  /**
   * 执行 Worker 任务
   *
   * @param type 任务类型
   * @param payload 任务数据
   * @param timeout 超时时间（覆盖默认）
   * @returns Promise
   *
   * @example
   * ```typescript
   * const result = await worker.exec('calculate', { n: 1000000 }, 5000);
   * ```
   */
  exec<T = unknown, R = unknown>(
    type: string,
    payload: T,
    timeout?: number,
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Worker has been terminated"));
        return;
      }

      const id = this.generateId();
      const message: WorkerMessage<T> = { id, type, payload };

      const taskTimeout = timeout || this.options.timeout || 30000;

      // 设置超时
      const timer = setTimeout(() => {
        this.pendingTasks.delete(id);
        reject(
          new Error(`Worker task "${type}" timeout after ${taskTimeout}ms`),
        );
      }, taskTimeout);

      // 存储任务
      this.pendingTasks.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      // 发送消息
      this.worker.postMessage(message);
    });
  }

  /**
   * 发送消息（无返回）
   *
   * @param type 消息类型
   * @param payload 消息数据
   */
  post<T = unknown>(type: string, payload: T): void {
    if (!this.worker) {
      throw new Error("Worker has been terminated");
    }

    const id = this.generateId();
    const message: WorkerMessage<T> = { id, type, payload };
    this.worker.postMessage(message);
  }

  /**
   * 设置消息监听器
   *
   * @param handler 消息处理器
   */
  onMessage(handler: (message: WorkerMessage) => void): void {
    this.worker?.addEventListener("message", (e) => {
      handler(e.data as WorkerMessage);
    });
  }

  /**
   * 设置错误监听器
   *
   * @param handler 错误处理器
   */
  onError(handler: (error: ErrorEvent) => void): void {
    this.worker?.addEventListener("error", handler);
  }

  /**
   * 终止 Worker
   *
   * @param immediate 是否立即终止
   */
  terminate(immediate = false): void {
    if (!this.worker) return;

    if (!immediate) {
      // 等待所有任务完成
      if (this.pendingTasks.size > 0) {
        setTimeout(() => this.terminate(false), 100);
        return;
      }
    }

    // 拒绝所有未完成的任务
    for (const [id, task] of this.pendingTasks) {
      if (task.timer) clearTimeout(task.timer);
      task.reject(new Error("Worker terminated"));
    }
    this.pendingTasks.clear();

    // 移除事件监听
    if (this.messageHandler) {
      this.worker.removeEventListener("message", this.messageHandler);
    }

    // 终止 Worker
    this.worker.terminate();
    this.worker = null;

    // 释放 blob URL
    if (this.url.startsWith("blob:")) {
      URL.revokeObjectURL(this.url);
    }
  }

  /**
   * 检查 Worker 是否活跃
   */
  isActive(): boolean {
    return this.worker !== null;
  }

  /**
   * 获取待处理任务数量
   */
  getPendingCount(): number {
    return this.pendingTasks.size;
  }

  // ==================== Worker 池 ====================

  /**
   * Worker 池
   */
  static Pool = class WorkerPool {
    private workers: WorkerManager[] = [];
    private queue: Array<{
      type: string;
      payload: unknown;
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
    }> = [];
    private currentIndex = 0;
    private script: string | ((ctx: Worker) => void);
    private options: WorkerPoolOptions;

    /**
     * 创建 Worker 池
     *
     * @param script Worker 脚本
     * @param options 池选项
     */
    constructor(
      script: string | ((ctx: Worker) => void),
      options: WorkerPoolOptions,
    ) {
      this.script = script;
      this.options = { reuse: true, ...options };

      // 初始化 Worker
      for (let i = 0; i < options.size; i++) {
        this.workers.push(
          new WorkerManager(script, {
            name: `pool-worker-${i}`,
            timeout: options.timeout,
          }),
        );
      }
    }

    /**
     * 执行任务（自动选择 Worker）
     *
     * @param type 任务类型
     * @param payload 任务数据
     * @returns Promise
     */
    async exec<T = unknown, R = unknown>(type: string, payload: T): Promise<R> {
      // 选择 Worker（轮询）
      const worker = this.workers[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.workers.length;

      return worker.exec(type, payload) as Promise<R>;
    }

    /**
     * 并行执行多个任务
     *
     * @param tasks 任务数组
     * @returns Promise 数组
     */
    async execAll<T = unknown, R = unknown>(
      tasks: Array<{ type: string; payload: T }>,
    ): Promise<any[]> {
      return Promise.all(
        tasks.map((task) => this.exec(task.type, task.payload)),
      );
    }

    /**
     * 终止所有 Worker
     */
    terminate(): void {
      for (const worker of this.workers) {
        worker.terminate(true);
      }
      this.workers = [];
      this.queue = [];
    }

    /**
     * 获取 Worker 数量
     */
    getSize(): number {
      return this.workers.length;
    }

    /**
     * 获取总待处理任务数
     */
    getPendingCount(): number {
      return this.workers.reduce((sum, w) => sum + w.getPendingCount(), 0);
    }
  };
}

// ==================== 快捷函数 ====================

/**
 * 创建内联 Worker
 *
 * @param fn Worker 函数
 * @param options 选项
 * @returns WorkerManager 实例
 *
 * @example
 * ```typescript
 * const worker = createWorker((ctx) => {
 *   ctx.onmessage = (e) => {
 *     const { data } = e.data;
 *     const result = data.map(x => x * 2);
 *     ctx.postMessage(result);
 *   };
 * });
 *
 * worker.postMessage([1, 2, 3, 4, 5]);
 * worker.onmessage = (e) => console.log(e.data); // [2, 4, 6, 8, 10]
 * ```
 */
export function createWorker(
  fn: (ctx: Worker) => void,
  options?: WorkerOptions,
): WorkerManager {
  return new WorkerManager(fn, options);
}

/**
 * 从文件创建 Worker
 *
 * @param scriptPath Worker 脚本路径
 * @param options 选项
 * @returns WorkerManager 实例
 */
export function createWorkerFromFile(
  scriptPath: string,
  options?: WorkerOptions,
): WorkerManager {
  return new WorkerManager(scriptPath, options);
}

/**
 * 创建 Worker 池
 *
 * @param script Worker 脚本（路径或函数）
 * @param options 池选项
 * @returns WorkerPool 实例
 *
 * @example
 * ```typescript
 * const pool = createWorkerPool('workers/processor.js', { size: 4 });
 *
 * // 并行处理多个任务
 * const results = await pool.execAll([
 *   { type: 'process', payload: data1 },
 *   { type: 'process', payload: data2 },
 *   { type: 'process', payload: data3 },
 * ]);
 * ```
 */
export function createWorkerPool(
  script: string | ((ctx: Worker) => void),
  options: WorkerPoolOptions,
): InstanceType<typeof WorkerManager.Pool> {
  return new WorkerManager.Pool(script, options);
}

// 默认导出
export default WorkerManager;
