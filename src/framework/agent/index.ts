/**
 * Agent Module
 * 简化的 Agent 系统
 *
 * @example
 * ```typescript
 * import { Agent, createAgent, getPresetPrompt, getBasicTools } from './framework/agent';
 *
 * // 创建 Agent
 * const agent = createAgent(core, {
 *   name: 'my-agent',
 *   provider: 'openai',
 *   tools: ['think', 'finish', 'read_file', 'write_file'],
 * });
 *
 * // 执行任务
 * const result = await agent.execute('帮我分析一下这个代码文件');
 * console.log(result.output);
 *
 * // 使用预设
 * const coder = createAgentFromPreset(core, 'coder', {
 *   provider: 'openai',
 * });
 * ```
 */

// 类型
export type {
  AgentConfig,
  AgentState,
  AgentMessage,
  AgentToolCall,
  AgentToolResult,
  AgentExecuteResult,
  AgentTool,
  AgentStep,
  AgentHooks,
  AgentRuntimeConfig,
  AgentCapability,
  CreateAgentOptions,
} from './types';

// Agent 核心
export { Agent, createAgent, createAgentFromPreset } from './agent';

// Prompts
export {
  // 预设 Prompts
  reactPrompt,
  plannerPrompt,
  executorPrompt,
  coderPrompt,
  researcherPrompt,
  conversationalPrompt,
  systemPrompt,
  // 工具函数
  getPresetPrompt,
  listPresetPrompts,
  createAgentPrompt,
} from './prompts';

// Tools
export {
  // 基础工具
  thinkTool,
  finishTool,
  askUserTool,
  // 文件工具
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  // 网络工具
  searchTool,
  httpRequestTool,
  // 系统工具
  executeCommandTool,
  // 记忆工具
  rememberTool,
  recallTool,
  // 代码工具
  analyzeCodeTool,
  // 工具函数
  getAllAgentTools,
  getToolsByCategory,
  getToolByName,
  getBasicTools,
  getFileTools,
  getNetworkTools,
  getSystemTools,
  getMemoryTools,
  createToolSet,
} from './tools';
