/**
 * IndexedDB Query Builder
 * 查询构建器
 */

import type {
  QueryOptions,
  FilterCondition,
  SortOptions,
  QueryCondition,
} from './types';

/**
 * 查询构建器
 */
export class QueryBuilder<T> {
  private store: IDBObjectStore;

  constructor(store: IDBObjectStore) {
    this.store = store;
  }

  /**
   * 执行查询
   */
  async execute(options: QueryOptions): Promise<T[]> {
    let results: T[] = await this.getAllRecords();

    // 应用过滤
    if (options.where) {
      results = this.applyFilter(results, options.where);
    }

    // 应用排序
    if (options.orderBy) {
      results = this.applySort(results, options.orderBy);
    }

    // 应用偏移和限制
    if (options.offset !== undefined || options.limit !== undefined) {
      const start = options.offset || 0;
      const end = options.limit !== undefined ? start + options.limit : undefined;
      results = results.slice(start, end);
    }

    // 应用字段选择
    if (options.select || options.exclude) {
      results = this.applyProjection(results, options.select, options.exclude);
    }

    return results;
  }

  /**
   * 获取所有记录
   */
  private async getAllRecords(): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const request = this.store.getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 应用过滤条件
   */
  private applyFilter(records: T[], where: FilterCondition): T[] {
    return records.filter((record) => this.matchesCondition(record, where));
  }

  /**
   * 检查记录是否匹配条件
   */
  private matchesCondition(record: T, condition: FilterCondition): boolean {
    // 处理逻辑运算符
    if ('$and' in condition && condition.$and) {
      return condition.$and.every((c) => this.matchesCondition(record, c));
    }

    if ('$or' in condition && condition.$or) {
      return condition.$or.some((c) => this.matchesCondition(record, c));
    }

    if ('$not' in condition && condition.$not) {
      return !this.matchesCondition(record, condition.$not);
    }

    // 处理字段条件
    for (const [field, value] of Object.entries(condition)) {
      // 跳过逻辑运算符
      if (field.startsWith('$')) continue;

      const recordValue = (record as Record<string, unknown>)[field];

      // 如果是查询条件对象
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (!this.matchesQueryCondition(recordValue, value as QueryCondition)) {
          return false;
        }
      } else {
        // 直接值比较
        if (recordValue !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 检查值是否匹配查询条件
   */
  private matchesQueryCondition(value: unknown, condition: QueryCondition): boolean {
    // 等于
    if ('$eq' in condition && condition.$eq !== undefined) {
      if (value !== condition.$eq) return false;
    }

    // 不等于
    if ('$ne' in condition && condition.$ne !== undefined) {
      if (value === condition.$ne) return false;
    }

    // 大于
    if ('$gt' in condition && condition.$gt !== undefined) {
      if (!(typeof value === 'number' && value > (condition.$gt as number))) return false;
    }

    // 大于等于
    if ('$gte' in condition && condition.$gte !== undefined) {
      if (!(typeof value === 'number' && value >= (condition.$gte as number))) return false;
    }

    // 小于
    if ('$lt' in condition && condition.$lt !== undefined) {
      if (!(typeof value === 'number' && value < (condition.$lt as number))) return false;
    }

    // 小于等于
    if ('$lte' in condition && condition.$lte !== undefined) {
      if (!(typeof value === 'number' && value <= (condition.$lte as number))) return false;
    }

    // 包含在数组中
    if ('$in' in condition && condition.$in) {
      if (!Array.isArray(condition.$in) || !condition.$in.includes(value)) return false;
    }

    // 不包含在数组中
    if ('$nin' in condition && condition.$nin) {
      if (Array.isArray(condition.$nin) && condition.$nin.includes(value)) return false;
    }

    // 模糊匹配
    if ('$like' in condition && condition.$like !== undefined) {
      const pattern = condition.$like.replace(/%/g, '.*');
      const regex = new RegExp(pattern, 'i');
      if (!regex.test(String(value))) return false;
    }

    // 正则匹配
    if ('$regex' in condition && condition.$regex) {
      const regex = condition.$regex instanceof RegExp
        ? condition.$regex
        : new RegExp(condition.$regex as string, 'i');
      if (!regex.test(String(value))) return false;
    }

    // 存在性检查
    if ('$exists' in condition && condition.$exists !== undefined) {
      const exists = value !== undefined && value !== null;
      if (exists !== condition.$exists) return false;
    }

    // 范围查询
    if ('$between' in condition && condition.$between) {
      const [min, max] = condition.$between as [unknown, unknown];
      if (typeof value === 'number') {
        if (value < (min as number) || value > (max as number)) return false;
      }
    }

    return true;
  }

  /**
   * 应用排序
   */
  private applySort(records: T[], orderBy: SortOptions): T[] {
    return [...records].sort((a, b) => {
      for (const [field, direction] of Object.entries(orderBy)) {
        const aVal = (a as Record<string, unknown>)[field];
        const bVal = (b as Record<string, unknown>)[field];

        // 处理空值
        if (aVal === undefined || aVal === null) {
          if (bVal !== undefined && bVal !== null) {
            return direction === 'asc' ? -1 : 1;
          }
          continue;
        }
        if (bVal === undefined || bVal === null) {
          return direction === 'asc' ? 1 : -1;
        }

        // 比较值
        let comparison = 0;
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          comparison = aVal.localeCompare(bVal);
        } else if (aVal instanceof Date && bVal instanceof Date) {
          comparison = aVal.getTime() - bVal.getTime();
        } else if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }

        if (comparison !== 0) {
          return direction === 'asc' ? comparison : -comparison;
        }
      }
      return 0;
    });
  }

  /**
   * 应用字段投影
   */
  private applyProjection(
    records: T[],
    select?: string[],
    exclude?: string[]
  ): T[] {
    return records.map((record) => {
      const result: Record<string, unknown> = {};

      if (select && select.length > 0) {
        // 只选择指定字段
        for (const field of select) {
          if (field in (record as Record<string, unknown>)) {
            result[field] = (record as Record<string, unknown>)[field];
          }
        }
      } else if (exclude && exclude.length > 0) {
        // 排除指定字段
        for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
          if (!exclude.includes(key)) {
            result[key] = value;
          }
        }
      } else {
        return record;
      }

      return result as T;
    });
  }

  /**
   * 使用索引查询（如果可用）
   */
  async queryByIndex(
    indexName: string,
    value: IDBValidKey | IDBKeyRange,
    options: Omit<QueryOptions, 'where'> = {}
  ): Promise<T[]> {
    if (!this.store.indexNames.contains(indexName)) {
      throw new Error(`Index '${indexName}' does not exist`);
    }

    const index = this.store.index(indexName);
    const results: T[] = [];

    return new Promise((resolve, reject) => {
      const request = index.openCursor(value);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;

        if (cursor) {
          results.push(cursor.value as T);
          cursor.continue();
        } else {
          // 应用排序、限制等
          let finalResults = results;

          if (options.orderBy) {
            finalResults = this.applySort(finalResults, options.orderBy);
          }

          if (options.offset !== undefined || options.limit !== undefined) {
            const start = options.offset || 0;
            const end = options.limit !== undefined ? start + options.limit : undefined;
            finalResults = finalResults.slice(start, end);
          }

          if (options.select || options.exclude) {
            finalResults = this.applyProjection(finalResults, options.select, options.exclude);
          }

          resolve(finalResults);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }
}
