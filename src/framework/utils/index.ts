/**
 * Utils Module
 * 通用工具类集合
 *
 * @example
 * ```typescript
 * import { EventBus, WorkerManager } from './framework/utils';
 *
 * // 事件总线
 * const events = new EventBus();
 * events.on('event', handler);
 *
 * // Worker 管理
 * const worker = new WorkerManager('worker.js');
 * const result = await worker.exec('task', data);
 * ```
 */

// EventBus
export {
  EventBus,
  createEventBus,
  getGlobalEventBus,
  setGlobalEventBus,
  type EventHandler,
  type EventOptions,
} from './event';

// Worker
export {
  WorkerManager,
  createWorker,
  createWorkerFromFile,
  createWorkerPool,
  type WorkerMessage,
  type WorkerOptions,
  type WorkerPoolOptions,
} from './worker';
