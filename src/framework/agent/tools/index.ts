/**
 * Agent Tools
 * Agent 专属工具集合
 */

import type { AgentTool } from '../types';

/**
 * 思考工具 - 让 Agent 进行结构化思考
 */
export const thinkTool: AgentTool = {
  name: 'think',
  description: '进行结构化思考，分析当前情况并制定计划',
  category: 'custom',
  parameters: {
    type: 'object',
    properties: {
      thought: {
        type: 'string',
        description: '你的思考内容',
      },
      nextStep: {
        type: 'string',
        description: '计划下一步行动',
      },
    },
    required: ['thought'],
  },
  examples: [
    '{"thought": "用户需要计算复杂数据，我应该先获取原始数据", "nextStep": "调用数据获取工具"}',
  ],
};

/**
 * 任务完成工具
 */
export const finishTool: AgentTool = {
  name: 'finish',
  description: '标记任务已完成，提供最终答案',
  category: 'custom',
  parameters: {
    type: 'object',
    properties: {
      answer: {
        type: 'string',
        description: '最终答案或结果总结',
      },
      success: {
        type: 'boolean',
        description: '任务是否成功完成',
      },
    },
    required: ['answer', 'success'],
  },
  examples: [
    '{"answer": "计算结果是 42", "success": true}',
    '{"answer": "无法找到相关数据", "success": false}',
  ],
};

/**
 * 等待用户输入工具
 */
export const askUserTool: AgentTool = {
  name: 'ask_user',
  description: '当需要更多信息时向用户提问',
  category: 'custom',
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: '要问用户的问题',
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: '可选答案（如果是选择题）',
      },
    },
    required: ['question'],
  },
  examples: [
    '{"question": "您想要什么格式的输出？", "options": ["JSON", "Markdown", "纯文本"]}',
  ],
};

/**
 * 网络搜索工具
 */
export const searchTool: AgentTool = {
  name: 'search',
  description: '在网络上搜索信息',
  category: 'search',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词',
      },
      limit: {
        type: 'number',
        description: '返回结果数量',
      },
    },
    required: ['query'],
  },
  examples: [
    '{"query": "TypeScript 最新版本特性", "limit": 3}',
  ],
};

/**
 * 读取文件工具
 */
export const readFileTool: AgentTool = {
  name: 'read_file',
  description: '读取文件内容',
  category: 'file',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径',
      },
      encoding: {
        type: 'string',
        description: '文件编码',
      },
    },
    required: ['path'],
  },
  examples: [
    '{"path": "/path/to/file.txt"}',
    '{"path": "/path/to/file.txt", "encoding": "utf-8"}',
  ],
};

/**
 * 写入文件工具
 */
export const writeFileTool: AgentTool = {
  name: 'write_file',
  description: '写入文件内容',
  category: 'file',
  requireConfirm: true,
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径',
      },
      content: {
        type: 'string',
        description: '文件内容',
      },
      append: {
        type: 'boolean',
        description: '是否追加模式',
      },
    },
    required: ['path', 'content'],
  },
  examples: [
    '{"path": "/path/to/file.txt", "content": "Hello World"}',
  ],
};

/**
 * 列出目录工具
 */
export const listDirectoryTool: AgentTool = {
  name: 'list_directory',
  description: '列出目录内容',
  category: 'file',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '目录路径',
      },
      recursive: {
        type: 'boolean',
        description: '是否递归列出子目录',
      },
    },
    required: ['path'],
  },
  examples: [
    '{"path": "/home/user/documents"}',
    '{"path": "/home/user/documents", "recursive": true}',
  ],
};

/**
 * 执行命令工具
 */
export const executeCommandTool: AgentTool = {
  name: 'execute_command',
  description: '执行系统命令',
  category: 'execute',
  requireConfirm: true,
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的命令',
      },
      cwd: {
        type: 'string',
        description: '工作目录',
      },
      timeout: {
        type: 'number',
        description: '超时时间（毫秒）',
      },
    },
    required: ['command'],
  },
  examples: [
    '{"command": "ls -la"}',
    '{"command": "npm install", "cwd": "/path/to/project"}',
  ],
};

/**
 * HTTP 请求工具
 */
export const httpRequestTool: AgentTool = {
  name: 'http_request',
  description: '发送 HTTP 请求',
  category: 'api',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '请求 URL',
      },
      method: {
        type: 'string',
        description: 'HTTP 方法',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      },
      headers: {
        type: 'object',
        description: '请求头',
      },
      body: {
        type: 'object',
        description: '请求体（JSON）',
      },
    },
    required: ['url'],
  },
  examples: [
    '{"url": "https://api.example.com/data", "method": "GET"}',
    '{"url": "https://api.example.com/data", "method": "POST", "body": {"key": "value"}}',
  ],
};

/**
 * 记忆存储工具
 */
export const rememberTool: AgentTool = {
  name: 'remember',
  description: '存储重要信息到记忆',
  category: 'custom',
  parameters: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: '记忆的键',
      },
      value: {
        type: 'string',
        description: '记忆的内容',
      },
      category: {
        type: 'string',
        description: '记忆分类',
      },
    },
    required: ['key', 'value'],
  },
  examples: [
    '{"key": "user_preference", "value": "喜欢深色模式", "category": "preference"}',
  ],
};

/**
 * 记忆检索工具
 */
export const recallTool: AgentTool = {
  name: 'recall',
  description: '从记忆中检索信息',
  category: 'custom',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询',
      },
      category: {
        type: 'string',
        description: '指定分类搜索',
      },
    },
    required: ['query'],
  },
  examples: [
    '{"query": "用户偏好"}',
    '{"query": "项目配置", "category": "config"}',
  ],
};

/**
 * 代码分析工具
 */
export const analyzeCodeTool: AgentTool = {
  name: 'analyze_code',
  description: '分析代码并提供建议',
  category: 'custom',
  parameters: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: '代码内容',
      },
      language: {
        type: 'string',
        description: '编程语言',
      },
      focus: {
        type: 'string',
        description: '分析重点',
        enum: ['bugs', 'performance', 'style', 'security', 'general'],
      },
    },
    required: ['code', 'language'],
  },
  examples: [
    '{"code": "function add(a, b) { return a + b }", "language": "javascript", "focus": "general"}',
  ],
};

/**
 * 获取所有 Agent 工具
 */
export function getAllAgentTools(): AgentTool[] {
  return [
    thinkTool,
    finishTool,
    askUserTool,
    searchTool,
    readFileTool,
    writeFileTool,
    listDirectoryTool,
    executeCommandTool,
    httpRequestTool,
    rememberTool,
    recallTool,
    analyzeCodeTool,
  ];
}

/**
 * 按分类获取工具
 */
export function getToolsByCategory(category: AgentTool['category']): AgentTool[] {
  return getAllAgentTools().filter((tool) => tool.category === category);
}

/**
 * 根据名称获取工具
 */
export function getToolByName(name: string): AgentTool | undefined {
  return getAllAgentTools().find((tool) => tool.name === name);
}

/**
 * 获取基础工具集（最常用）
 */
export function getBasicTools(): AgentTool[] {
  return [thinkTool, finishTool, askUserTool];
}

/**
 * 获取文件操作工具集
 */
export function getFileTools(): AgentTool[] {
  return [readFileTool, writeFileTool, listDirectoryTool];
}

/**
 * 获取网络工具集
 */
export function getNetworkTools(): AgentTool[] {
  return [searchTool, httpRequestTool];
}

/**
 * 获取系统工具集
 */
export function getSystemTools(): AgentTool[] {
  return [executeCommandTool];
}

/**
 * 获取记忆工具集
 */
export function getMemoryTools(): AgentTool[] {
  return [rememberTool, recallTool];
}

/**
 * 创建自定义工具集
 */
export function createToolSet(toolNames: string[]): AgentTool[] {
  return toolNames
    .map((name) => getToolByName(name))
    .filter((tool): tool is AgentTool => tool !== undefined);
}
