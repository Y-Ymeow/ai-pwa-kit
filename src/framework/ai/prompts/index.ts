/**
 * Prompts Module
 * Prompt 模板定义和管理，支持变量替换和分片组装
 */

import type { AIMessage } from '../../types';

export type PromptRole = 'system' | 'user' | 'assistant' | 'tool';

export interface PromptVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  description?: string;
  default?: unknown;
}

export interface PromptFragment {
  /** 角色 */
  role: PromptRole;
  /** 模板内容（可包含变量 {{varName}}） */
  template: string;
  /** 该片段需要的变量 */
  variables?: PromptVariable[];
  /** 条件：只有当条件满足时才包含此片段 */
  condition?: (vars: Record<string, unknown>) => boolean;
  /** 片段名称（用于标识） */
  name?: string;
}

export interface PromptTemplate {
  name: string;
  description?: string;
  /** 完整模板字符串（简化用法） */
  template?: string;
  /** 模板分片（高级用法，组装成消息数组） */
  fragments?: PromptFragment[];
  /** 全局变量定义 */
  variables?: PromptVariable[];
  version?: string;
  tags?: string[];
}

/**
 * Prompt 模板管理器
 */
export class PromptManager {
  private prompts = new Map<string, PromptTemplate>();

  /**
   * 注册 Prompt 模板
   */
  register(template: PromptTemplate): void {
    this.prompts.set(template.name, template);
  }

  /**
   * 获取 Prompt 模板
   */
  get(name: string): PromptTemplate | undefined {
    return this.prompts.get(name);
  }

  /**
   * 列出所有 Prompt
   */
  list(): PromptTemplate[] {
    return Array.from(this.prompts.values());
  }

  /**
   * 按标签筛选
   */
  filterByTag(tag: string): PromptTemplate[] {
    return this.list().filter((p) => p.tags?.includes(tag));
  }

  /**
   * 删除 Prompt
   */
  remove(name: string): boolean {
    return this.prompts.delete(name);
  }

  /**
   * 渲染简单模板（变量替换）
   * @deprecated 建议使用 buildMessages 获取结构化消息
   */
  render(name: string, variables: Record<string, unknown> = {}): string {
    const template = this.get(name);
    if (!template) {
      throw new Error(`Prompt template "${name}" not found`);
    }

    if (template.template) {
      return this.replaceVariables(template.template, variables);
    }

    // 如果没有简单模板，拼接所有片段
    if (template.fragments) {
      return template.fragments
        .filter((f) => !f.condition || f.condition(variables))
        .map((f) => `[${f.role}]\n${this.replaceVariables(f.template, variables)}`)
        .join('\n\n');
    }

    return '';
  }

  /**
   * 构建 AI 消息数组（分片组装）
   * 将模板转换为 {role, content} 格式，供 AI 请求使用
   */
  buildMessages(
    name: string,
    variables: Record<string, unknown> = {}
  ): AIMessage[] {
    const template = this.get(name);
    if (!template) {
      throw new Error(`Prompt template "${name}" not found`);
    }

    // 优先使用 fragments
    if (template.fragments && template.fragments.length > 0) {
      return this.buildFromFragments(template.fragments, variables);
    }

    // 使用简单模板作为 user 消息
    if (template.template) {
      return [
        {
          role: 'user',
          content: this.replaceVariables(template.template, variables),
        },
      ];
    }

    return [];
  }

  /**
   * 从分片构建消息数组
   */
  private buildFromFragments(
    fragments: PromptFragment[],
    variables: Record<string, unknown>
  ): AIMessage[] {
    const messages: AIMessage[] = [];

    for (const fragment of fragments) {
      // 检查条件
      if (fragment.condition && !fragment.condition(variables)) {
        continue;
      }

      // 验证片段所需变量
      if (fragment.variables) {
        for (const v of fragment.variables) {
          if (v.required && variables[v.name] === undefined && v.default === undefined) {
            throw new Error(`Missing required variable "${v.name}" for fragment "${fragment.name || 'unnamed'}"`);
          }
        }
      }

      // 替换变量
      const content = this.replaceVariables(fragment.template, variables);

      messages.push({
        role: fragment.role,
        content,
      });
    }

    return messages;
  }

  /**
   * 变量替换
   */
  private replaceVariables(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = variables[key];
      if (value !== undefined) {
        return String(value);
      }
      // 尝试从全局变量找默认值
      return match;
    });
  }

  /**
   * 验证变量
   */
  validateVariables(
    name: string,
    variables: Record<string, unknown>
  ): { valid: boolean; errors: string[] } {
    const template = this.get(name);
    if (!template) {
      return { valid: false, errors: [`Template "${name}" not found`] };
    }

    const errors: string[] = [];
    const allVars = new Map<string, PromptVariable>();

    // 收集所有变量定义
    if (template.variables) {
      for (const v of template.variables) {
        allVars.set(v.name, v);
      }
    }
    if (template.fragments) {
      for (const f of template.fragments) {
        if (f.variables) {
          for (const v of f.variables) {
            if (!allVars.has(v.name)) {
              allVars.set(v.name, v);
            }
          }
        }
      }
    }

    // 验证必填变量
    for (const [name, def] of allVars) {
      if (def.required && variables[name] === undefined && def.default === undefined) {
        errors.push(`Missing required variable: ${name}`);
      }
      // TODO: 类型验证
    }

    return { valid: errors.length === 0, errors };
  }
}

/**
 * 创建 Prompt 片段工厂函数
 */
export function createFragment(
  role: PromptRole,
  template: string,
  options: Omit<PromptFragment, 'role' | 'template'> = {}
): PromptFragment {
  return {
    role,
    template,
    ...options,
  };
}

/**
 * 创建 Prompt 模板工厂函数（简单模板）
 */
export function createPrompt(
  name: string,
  template: string,
  options: Omit<PromptTemplate, 'name' | 'template' | 'fragments'> = {}
): PromptTemplate {
  return {
    name,
    template,
    ...options,
  };
}

/**
 * 创建 Prompt 模板工厂函数（分片模板）
 */
export function createPromptWithFragments(
  name: string,
  fragments: PromptFragment[],
  options: Omit<PromptTemplate, 'name' | 'fragments' | 'template'> = {}
): PromptTemplate {
  return {
    name,
    fragments,
    ...options,
  };
}

/**
 * Prompt Builder - 链式构建 Prompt
 */
export class PromptBuilder {
  private fragments: PromptFragment[] = [];
  private variables: Record<string, unknown> = {};

  /**
   * 添加系统消息
   */
  system(template: string, condition?: (vars: Record<string, unknown>) => boolean): this {
    this.fragments.push({ role: 'system', template, condition });
    return this;
  }

  /**
   * 添加用户消息
   */
  user(template: string, condition?: (vars: Record<string, unknown>) => boolean): this {
    this.fragments.push({ role: 'user', template, condition });
    return this;
  }

  /**
   * 添加助手消息（用于 few-shot 示例）
   */
  assistant(template: string, condition?: (vars: Record<string, unknown>) => boolean): this {
    this.fragments.push({ role: 'assistant', template, condition });
    return this;
  }

  /**
   * 设置变量
   */
  setVar(key: string, value: unknown): this {
    this.variables[key] = value;
    return this;
  }

  /**
   * 批量设置变量
   */
  setVars(vars: Record<string, unknown>): this {
    this.variables = { ...this.variables, ...vars };
    return this;
  }

  /**
   * 构建消息数组
   */
  build(): AIMessage[] {
    const messages: AIMessage[] = [];

    for (const fragment of this.fragments) {
      if (fragment.condition && !fragment.condition(this.variables)) {
        continue;
      }

      const content = fragment.template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const value = this.variables[key];
        return value !== undefined ? String(value) : match;
      });

      messages.push({
        role: fragment.role,
        content,
      });
    }

    return messages;
  }

  /**
   * 清空
   */
  clear(): this {
    this.fragments = [];
    this.variables = {};
    return this;
  }
}