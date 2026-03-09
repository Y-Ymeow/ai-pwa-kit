/**
 * Compression - 压缩解压模块
 *
 * 提供文本、对象、文件的压缩和解压功能
 * 支持多种压缩算法（gzip、deflate）
 *
 * @example
 * ```typescript
 * import { Compression } from './framework/storages';
 *
 * const compression = new Compression();
 *
 * // 压缩文本
 * const compressed = await compression.compressText(largeText);
 * const original = await compression.decompressText(compressed);
 *
 * // 压缩对象
 * const data = { users: [...] };
 * const compressed = await compression.compressObject(data);
 * const restored = await compression.decompressObject(compressed);
 *
 * // 压缩文件
 * await compression.compressFile('/data/large.json', '/data/large.json.gz');
 * ```
 */

/**
 * 压缩选项
 */
export interface CompressionOptions {
  /** 压缩算法 */
  algorithm?: 'gzip' | 'deflate';
  /** 压缩级别 (1-9, 默认 6) */
  level?: number;
  /** 是否添加头部信息 */
  addHeader?: boolean;
}

/**
 * 压缩结果
 */
export interface CompressionResult {
  /** 压缩后的数据 */
  data: Uint8Array;
  /** 原始大小 */
  originalSize: number;
  /** 压缩后大小 */
  compressedSize: number;
  /** 压缩率 (百分比) */
  ratio: number;
  /** 使用的算法 */
  algorithm: string;
}

/**
 * 压缩解压类
 */
export class Compression {
  private options: CompressionOptions;

  constructor(options: CompressionOptions = {}) {
    this.options = {
      algorithm: 'gzip',
      level: 6,
      addHeader: true,
      ...options,
    };
  }

  /**
   * 检查浏览器是否支持 Compression Streams API
   */
  private isCompressionStreamSupported(): boolean {
    return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
  }

  /**
   * 使用 Compression Streams API 压缩
   */
  private async compressWithStream(data: Uint8Array, algorithm: string): Promise<Uint8Array> {
    const stream = new CompressionStream(algorithm as CompressionFormat);
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    // 写入数据
    writer.write(data.buffer as ArrayBuffer);
    writer.close();

    // 读取压缩后的数据
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.length;
    }

    // 合并 chunks
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  /**
   * 使用 Compression Streams API 解压
   */
  private async decompressWithStream(data: Uint8Array, algorithm: string): Promise<Uint8Array> {
    const stream = new DecompressionStream(algorithm as CompressionFormat);
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    // 写入数据
    writer.write(data.buffer as ArrayBuffer);
    writer.close();

    // 读取解压后的数据
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.length;
    }

    // 合并 chunks
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  /**
   * 简单的 LZ77-like 压缩（备用方案，当浏览器不支持 CompressionStream 时使用）
   */
  private compressSimple(data: Uint8Array): Uint8Array {
    // 使用简单的 RLE (Run-Length Encoding) 压缩
    const result: number[] = [];
    let i = 0;

    while (i < data.length) {
      const byte = data[i];
      let count = 1;

      // 统计连续相同的字节
      while (i + count < data.length && data[i + count] === byte && count < 255) {
        count++;
      }

      if (count > 3) {
        // 使用 RLE: 0x00 + count + byte
        result.push(0x00, count, byte);
        i += count;
      } else {
        // 直接输出字节，但需要转义 0x00
        for (let j = 0; j < count; j++) {
          if (data[i + j] === 0x00) {
            result.push(0x00, 0x01, 0x00); // 转义 0x00
          } else {
            result.push(data[i + j]);
          }
        }
        i += count;
      }
    }

    return new Uint8Array(result);
  }

  /**
   * 简单的解压（备用方案）
   */
  private decompressSimple(data: Uint8Array): Uint8Array {
    const result: number[] = [];
    let i = 0;

    while (i < data.length) {
      if (data[i] === 0x00) {
        if (i + 1 >= data.length) break;

        if (data[i + 1] === 0x01) {
          // 转义的 0x00
          result.push(0x00);
          i += 2;
        } else if (i + 2 < data.length) {
          // RLE: count + byte
          const count = data[i + 1];
          const byte = data[i + 2];
          for (let j = 0; j < count; j++) {
            result.push(byte);
          }
          i += 3;
        } else {
          i++;
        }
      } else {
        result.push(data[i]);
        i++;
      }
    }

    return new Uint8Array(result);
  }

  /**
   * 添加头部信息
   */
  private addHeader(data: Uint8Array, algorithm: string): Uint8Array {
    if (!this.options.addHeader) return data;

    const header = new TextEncoder().encode(`COMP:${algorithm}:`);
    const result = new Uint8Array(header.length + data.length);
    result.set(header);
    result.set(data, header.length);
    return result;
  }

  /**
   * 读取头部信息
   */
  private readHeader(data: Uint8Array): { algorithm: string; data: Uint8Array } {
    const headerStr = new TextDecoder().decode(data.slice(0, 50));
    const match = headerStr.match(/^COMP:([^:]+):/);

    if (match) {
      const algorithm = match[1];
      const headerLength = match[0].length;
      return {
        algorithm,
        data: data.slice(headerLength),
      };
    }

    // 没有头部信息，返回原始数据
    return { algorithm: this.options.algorithm!, data };
  }

  /**
   * 压缩 Uint8Array 数据
   *
   * @param data 原始数据
   * @param options 压缩选项
   * @returns 压缩结果
   */
  async compress(data: Uint8Array, options?: CompressionOptions): Promise<CompressionResult> {
    const opts = { ...this.options, ...options };
    const algorithm = opts.algorithm || 'gzip';

    let compressed: Uint8Array;
    let usedAlgorithm: string = algorithm;

    if (this.isCompressionStreamSupported() && (algorithm === 'gzip' || algorithm === 'deflate')) {
      try {
        compressed = await this.compressWithStream(data, algorithm);
        usedAlgorithm = algorithm;
      } catch {
        // 降级到简单压缩
        compressed = this.compressSimple(data);
        usedAlgorithm = 'simple';
      }
    } else {
      compressed = this.compressSimple(data);
      usedAlgorithm = 'simple';
    }

    // 添加头部
    if (opts.addHeader) {
      compressed = this.addHeader(compressed, usedAlgorithm);
    }

    const originalSize = data.length;
    const compressedSize = compressed.length;
    const ratio = ((originalSize - compressedSize) / originalSize) * 100;

    return {
      data: compressed,
      originalSize,
      compressedSize,
      ratio: Math.max(0, ratio),
      algorithm: usedAlgorithm,
    };
  }

  /**
   * 解压 Uint8Array 数据
   *
   * @param data 压缩数据
   * @returns 解压后的数据
   */
  async decompress(data: Uint8Array): Promise<Uint8Array> {
    // 读取头部
    const { algorithm, data: compressedData } = this.readHeader(data);

    if (algorithm === 'simple') {
      return this.decompressSimple(compressedData);
    }

    if (this.isCompressionStreamSupported()) {
      try {
        return await this.decompressWithStream(compressedData, algorithm as string);
      } catch {
        // 如果解压失败，尝试简单解压
        return this.decompressSimple(compressedData);
      }
    }

    return this.decompressSimple(compressedData);
  }

  /**
   * 压缩文本
   *
   * @param text 原始文本
   * @param options 压缩选项
   * @returns 压缩结果（Base64 编码的字符串）
   */
  async compressText(text: string, options?: CompressionOptions): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const result = await this.compress(data, options);

    // 转换为 Base64
    const binary = Array.from(result.data)
      .map((b) => String.fromCharCode(b))
      .join('');
    return btoa(binary);
  }

  /**
   * 解压文本
   *
   * @param compressed Base64 编码的压缩数据
   * @returns 原始文本
   */
  async decompressText(compressed: string): Promise<string> {
    // 从 Base64 解码
    const binary = atob(compressed);
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      data[i] = binary.charCodeAt(i);
    }

    const decompressed = await this.decompress(data);
    return new TextDecoder().decode(decompressed);
  }

  /**
   * 压缩对象（JSON）
   *
   * @param obj 对象
   * @param options 压缩选项
   * @returns 压缩结果（Base64 编码的字符串）
   */
  async compressObject<T = unknown>(obj: T, options?: CompressionOptions): Promise<string> {
    const json = JSON.stringify(obj);
    return this.compressText(json, options);
  }

  /**
   * 解压对象（JSON）
   *
   * @param compressed Base64 编码的压缩数据
   * @returns 原始对象
   */
  async decompressObject<T = unknown>(compressed: string): Promise<T> {
    const json = await this.decompressText(compressed);
    return JSON.parse(json) as T;
  }

  /**
   * 计算压缩率
   *
   * @param originalSize 原始大小（字节）
   * @param compressedSize 压缩后大小（字节）
   * @returns 压缩率（百分比）
   */
  getCompressionRatio(originalSize: number, compressedSize: number): number {
    if (originalSize === 0) return 0;
    const ratio = ((originalSize - compressedSize) / originalSize) * 100;
    return Math.max(0, parseFloat(ratio.toFixed(2)));
  }

  /**
   * 格式化文件大小
   *
   * @param bytes 字节数
   * @returns 格式化后的字符串
   */
  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// ==================== 快捷函数 ====================

/**
 * 创建压缩实例
 *
 * @param options 压缩选项
 * @returns Compression 实例
 */
export function createCompression(options?: CompressionOptions): Compression {
  return new Compression(options);
}

/**
 * 快速压缩文本
 *
 * @param text 原始文本
 * @param options 压缩选项
 * @returns Base64 编码的压缩字符串
 */
export async function compressText(text: string, options?: CompressionOptions): Promise<string> {
  const compression = new Compression(options);
  return compression.compressText(text);
}

/**
 * 快速解压文本
 *
 * @param compressed Base64 编码的压缩字符串
 * @returns 原始文本
 */
export async function decompressText(compressed: string): Promise<string> {
  const compression = new Compression();
  return compression.decompressText(compressed);
}

/**
 * 快速压缩对象
 *
 * @param obj 对象
 * @param options 压缩选项
 * @returns Base64 编码的压缩字符串
 */
export async function compressObject<T = unknown>(
  obj: T,
  options?: CompressionOptions
): Promise<string> {
  const compression = new Compression(options);
  return compression.compressObject(obj);
}

/**
 * 快速解压对象
 *
 * @param compressed Base64 编码的压缩字符串
 * @returns 原始对象
 */
export async function decompressObject<T = unknown>(compressed: string): Promise<T> {
  const compression = new Compression();
  return compression.decompressObject<T>(compressed);
}

// 默认导出
export default Compression;
