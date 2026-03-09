# AI PWA Kit

面向 PWA 的 AI 开发工具包，提供构建 AI 驱动 Web 应用的完整解决方案。

---

## 项目简介

**AI PWA Kit** 是一套专为 Progressive Web App (PWA) 设计的 AI 开发工具包。它提供了完整的工具集，帮助开发者快速构建运行在浏览器中的 AI 驱动应用程序。所有功能都针对浏览器环境优化，支持离线存储、跨域请求、状态管理等 PWA 核心特性。

### 核心特性

- **统一的 Provider 接口**：支持 OpenAI、Claude 等多种 AI 服务，可轻松扩展
- **智能的 Prompt 管理**：模板变量替换、分片组装、多轮对话支持
- **灵活的工具调用**：原生格式 + `<tool>` 标签格式，兼容所有模型
- **模糊匹配记忆系统**：基于 OPFS 的持久化存储，支持关键词和语义搜索
- **多格式响应解析**：自动提取 thinking、tool calls 等内容
- **Token 预算管理**：精确控制和估算 Token 使用量
- **通用存储模块**：支持 OPFS、LocalStorage、Memory、IndexedDB
- **跨域请求支持**：通过油猴脚本/Chrome插件绕过 CORS 限制
- **类 ORM 数据库**：IndexedDB 的 ORM 封装，支持迁移
- **Agent 系统**：简化的 ReAct Agent 实现，支持自定义工具和 Prompt
- **跨框架状态管理**：全局状态管理器，支持订阅、切片、持久化，兼容任意框架
- **工具类**：事件总线、Worker 管理、压缩解压等通用工具

---

## 快速开始

### 安装

```bash
npm install
```

### 方式一：使用快捷函数（推荐）

```typescript
import { 
  initFramework,
  createOpenAI,
  initDatabase,
  f
} from './framework';

// 快速初始化完整框架
const { core, storage, requests, db } = initFramework({
  openai: { apiKey: 'your-api-key', model: 'gpt-4' },
  storage: { type: 'localStorage', name: 'my-app' },
  indexedDB: { name: 'my-app-db', version: 1 }
});

// 定义 IndexedDB 模型
const User = defineModel(db!, 'users', {
  id: f.id(),
  name: f.string({ required: true }),
  email: f.string(),
  createdAt: f.date({ default: () => new Date() })
});

// 使用
await User.create({ name: '张三', email: 'zhang@test.com' });
```

### 方式二：按需导入特定模块

```typescript
// AI 模块
import { FrameworkCore, OpenAIProvider } from './framework/ai';

// 存储模块
import { StorageManager, LocalStorage } from './framework/storages';

// 请求模块
import { RequestManager, FetchAdapter } from './framework/requests';

// IndexedDB 模块
import { IDBDatabase, Model, field } from './framework/indexeddb';
```

---

## 模块说明

### 快捷函数 (`helper.ts`)

框架提供一系列快捷函数，简化常用操作：

```typescript
import {
  // AI
  createCore,              // 创建框架核心
  createOpenAI,            // 创建 OpenAI Provider
  initOpenAICore,          // 快速初始化 OpenAI
  createProvider,          // 创建任意 OpenAI 兼容 Provider

  // 存储
  initStorage,             // 初始化存储管理器
  createOPFS,              // 创建 OPFS 存储
  createLocalStorage,      // 创建 LocalStorage

  // 压缩
  initCompression,         // 创建压缩实例
  compressText,            // 压缩文本
  decompressText,          // 解压文本
  compressObject,          // 压缩对象
  decompressObject,        // 解压对象

  // 请求
  initRequestManager,      // 初始化请求管理器

  // IndexedDB
  initDatabase,            // 初始化数据库
  defineModel,             // 定义模型
  f,                       // 字段快捷定义

  // State
  initStore,               // 创建状态管理器
  getGlobalStore,          // 获取全局 Store
  defineSlice,             // 定义状态切片

  // Utils - 事件
  initEventBus,            // 创建事件总线

  // Utils - Worker
  initWorker,              // 创建内联 Worker
  initWorkerPool,          // 创建 Worker 池

  // 组合
  initFramework            // 一键初始化完整框架
} from './framework';
```

### AI 模块 (`ai/`)

AI 相关功能的统一入口。

```typescript
import { 
  FrameworkCore,
  OpenAIProvider,
  PromptManager,
  ToolManager,
  // ... 其他 AI 功能
} from './framework/ai';
```

#### Core - 框架核心

```typescript
const core = new FrameworkCore({
  defaultProvider: 'openai',
  timeout: 30000,
});
```

#### Providers - AI Provider

框架提供通用的 **OpenAI 兼容 Provider**，支持任何遵循 OpenAI API 格式的服务商：

```typescript
import { createProvider, createOpenAI } from './framework';

// ===== 通用方式 - 支持任何 OpenAI 兼容 API =====
const provider = createProvider({
  name: 'deepseek',
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat'
});

// ===== 快速创建 OpenAI =====
const openai = createOpenAI(process.env.OPENAI_API_KEY, {
  model: 'gpt-4o',
  organization: 'org-xxx',
  project: 'proj-xxx'
});

// ===== 普通请求 =====
const response = await provider.request({
  messages: [
    { role: 'system', content: '你是助手' },
    { role: 'user', content: '你好' }
  ]
});
console.log(response.content);

// ===== 流式请求 =====
for await (const chunk of provider.stream({ messages: [...] })) {
  console.log(chunk.content);
}

// ===== 使用工具 =====
const toolResponse = await provider.request({
  messages: [{ role: 'user', content: '查天气' }],
  tools: [{
    type: 'function',
    function: {
      name: 'getWeather',
      description: '获取天气',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string' }
        }
      }
    }
  }]
});

// ===== 启用思考模式 =====
provider.enableThinking({
  type: 'enabled',
  max_tokens: 8192
});
```

支持任意服务商：OpenAI, DeepSeek, 智谱, 字节火山, 腾讯混元, Groq, Mistral, Gemini, Cerebras, OpenRouter 等。

#### Prompts - Prompt 管理

```typescript
// 分片模板
core.registerPrompt('chat', {
  name: 'chat',
  fragments: [
    { role: 'system', template: '你是 {{role}}。' },
    { role: 'user', template: '{{question}}' },
  ],
});
```

#### Tools - 工具调用

```typescript
const toolManager = new ToolManager();

toolManager.register(
  {
    name: 'getWeather',
    description: '获取天气信息',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: '城市名' },
      },
      required: ['city'],
    },
  },
  async (args) => {
    return await fetchWeather(args.city);
  }
);
```

### 存储模块 (`storages/`)

通用存储接口，支持多种后端：

```typescript
import { 
  StorageManager,
  OPFSStorage, 
  LocalStorage, 
  MemoryStorage 
} from './framework/storages';

// 使用管理器
const storage = new StorageManager({ defaultStorage: 'localStorage' });
await storage.set('user', { name: '张三' });
const user = await storage.getValue('user');

// 获取底层存储实例
const localStorageInstance = storage.getStorage('localStorage');

// 直接使用
const opfs = new OPFSStorage('my-app');
await opfs.init();
```

### 请求模块 (`requests/`)

统一请求接口，支持多种适配器：

```typescript
import { 
  RequestManager,
  FetchAdapter,
  createAutoExternalAdapter  // 自动检测油猴/Chrome
} from './framework/requests';

const manager = new RequestManager();

// 自动注册外部适配器（绕过 CORS）
const externalAdapter = createAutoExternalAdapter();
if (externalAdapter) {
  manager.register(externalAdapter);
  manager.setDefault('gm_xhr');
}

// 发送请求
const response = await manager.get('https://api.example.com/data');
```

### IndexedDB 模块 (`indexeddb/`)

类 ORM 的 IndexedDB 封装：

```typescript
import { 
  IDBDatabase, 
  Model, 
  field,
  defineSchema 
} from './framework/indexeddb';

// 创建数据库
const db = new IDBDatabase({
  name: 'my-app',
  version: 2,
  migrations: [
    {
      version: 1,
      steps: [{ action: 'create', model: 'users', changes: { keyPath: 'id' } }]
    }
  ]
});
await db.init();

// 定义模型
const User = new Model(db, 'users', {
  id: field.primary(),
  name: field.string({ required: true }),
  email: field.string({ unique: true }),
});

// CRUD 操作
await User.create({ name: '张三', email: 'zhang@test.com' });
const users = await User.findMany({ 
  where: { age: { $gte: 18 } },
  orderBy: { createdAt: 'desc' }
});
```

### Memory 模块 (`memory/`)

基于 OPFS 的记忆系统：

```typescript
import { Memory } from './framework/memory';

const memory = new Memory();
await memory.init();

// 存储记忆
await memory.add('用户喜欢深色模式', { tags: ['preference'] });

// 模糊搜索
const results = await memory.search('深色主题', { limit: 5 });
```

### Agent 模块 (`agent/`)

简化的 Agent 系统，支持 ReAct 模式：

```typescript
import { 
  Agent, 
  createAgent, 
} from './framework/agent';
import { createCoderAgent } from './framework';

// 方式一：从预设创建
const coder = createCoderAgent(core);
const result = await coder.execute('帮我分析这个代码文件');
console.log(result.output);
```
// 方式二：自定义配置
const agent = createAgent(core, {
  name: 'my-agent',
  provider: 'openai',
  tools: ['think', 'finish', 'read_file', 'write_file'],
  maxIterations: 5
});

// 方式三：带 Hooks 的使用
const agentWithHooks = createAgent(core, config, {
  onStepStart: (step) => console.log('开始:', step),
  onStepComplete: (step) => console.log('完成:', step),
  beforeToolCall: (call) => confirm(`执行 ${call.name}?`)
});
```

#### Agent 专属 Tools

```typescript
import { getFileTools, getNetworkTools, createToolSet } from './framework/agent';

// 获取文件操作工具集
const fileTools = getFileTools();

// 获取网络工具集
const networkTools = getNetworkTools();

// 自定义工具集
const myTools = createToolSet(['think', 'finish', 'search']);
```

#### Agent 专属 Prompts

```typescript
import { 
  reactPrompt, 
  coderPrompt, 
  getPresetPrompt 
} from './framework/agent';

// 使用预设 Prompt
const prompt = getPresetPrompt('react');

// 可用的预设：react, planner, executor, coder, researcher, conversational, system
```

### State 模块 (`state/`)

跨框架全局状态管理器，支持订阅、切片、持久化：

```typescript
import { 
  Store, 
  createStore, 
} from './framework/state';
import { initSlice, createSlice } from './framework';

// 创建 Store
const store = createStore({
  initialState: { count: 0, user: null },
  persist: { key: 'my-app-state' }
});

// 订阅状态变化
store.subscribe((state, prevState, info) => {
  console.log('状态变化:', info.path, info.value);
});

// 更新状态
store.setState({ count: 10 });
store.updateState(state => ({ count: state.count + 1 }));

// 使用切片
const counter = initSlice(store, 'counter', { value: 0 });
counter.setState(s => ({ value: s.value + 1 }));
console.log(counter.getState().value); // 1

// 自定义切片
const todoSlice = createSlice({
  name: 'todos',
  initialState: [],
  reducers: {
    add: (state, todo) => [...state, todo],
    remove: (state, id) => (state as any[]).filter(t => t.id !== id),
    toggle: (state, id) => (state as any[]).map(t => 
      t.id === id ? { ...t, done: !t.done } : t
    )
  }
});
```

#### 与框架集成

**React:**
```typescript
function useStore<T>(selector: (state: any) => T): T {
  const [value, setValue] = useState(() => selector(store.getState()));
  useEffect(() => store.subscribe((s) => setValue(selector(s))), []);
  return value;
}

// 使用
const count = useStore(s => s.count);
```

**Vue:**
```typescript
const storeState = reactive(store.getState());
store.subscribe((s) => Object.assign(storeState, s));
```

### Utils 模块 (`utils/`)

通用工具类集合：

#### EventBus - 事件总线

```typescript
import { EventBus, createEventBus } from './framework/utils';

// ===== 创建事件总线 =====
const events = createEventBus();
// 或带命名空间
const userEvents = createEventBus('user');

// ===== 订阅事件 =====
// 普通订阅
const unsubscribe = events.on('user:login', (user) => {
  console.log('用户登录:', user);
});

// 订阅一次
events.once('app:ready', () => {
  console.log('应用已就绪');
});

// 带优先级（数字越小优先级越高）
events.on('data:update', handler, { priority: 1 });

// ===== 触发事件 =====
// 异步触发（等待所有处理器完成）
await events.emit('user:login', { id: 1, name: '张三' });

// 同步触发（不等待）
events.emitSync('user:login', { id: 1, name: '张三' });

// ===== 取消订阅 =====
unsubscribe();
// 或取消特定处理器的订阅
events.off('user:login', handler);
// 取消所有订阅
events.off('user:login');

// ===== 等待事件 =====
const user = await events.waitFor('user:login', 5000); // 5秒超时

// ===== 其他功能 =====
// 查看订阅数量
events.listenerCount('user:login');
// 查看所有事件名
events.eventNames();
// 清空所有事件
events.clear();
```

#### WorkerManager - WebWorker 管理

```typescript
import { WorkerManager, createWorker, createWorkerPool } from './framework/utils';

// ===== 方式一：内联 Worker =====
const worker = createWorker((ctx) => {
  // Worker 内部代码
  ctx.onmessage = (e) => {
    const { type, payload } = e.data;
    
    if (type === 'calculate') {
      // 耗时计算
      let sum = 0;
      for (let i = 0; i < payload.n; i++) {
        sum += i;
      }
      ctx.postMessage(sum);
    }
  };
});

// 执行任务
const result = await worker.exec('calculate', { n: 1000000 }, 10000);
console.log(result); // 499999500000

// 终止 Worker
worker.terminate();

// ===== 方式二：从文件创建 =====
const fileWorker = new WorkerManager('workers/calculator.js');
const result = await fileWorker.exec('fibonacci', { n: 40 }, 30000);

// ===== 方式三：Worker 池 =====
const pool = createWorkerPool('workers/processor.js', { size: 4 });

// 并行执行多个任务
const results = await pool.execAll([
  { type: 'process', payload: data1 },
  { type: 'process', payload: data2 },
  { type: 'process', payload: data3 },
  { type: 'process', payload: data4 },
]);

// 查看待处理任务数
console.log(pool.getPendingCount());

// 终止所有 Worker
pool.terminate();
```

### Storages 扩展功能

#### Compression - 压缩解压

```typescript
import { Compression, createCompression } from './framework/storages';

// ===== 创建压缩实例 =====
const compression = createCompression({
  algorithm: 'gzip',  // gzip 或 deflate
  level: 6,           // 压缩级别 1-9
});

// ===== 压缩文本 =====
const largeText = 'a'.repeat(10000);
const compressed = await compression.compressText(largeText);
// 返回 Base64 编码的压缩字符串
console.log('压缩后:', compressed);

// 解压文本
const original = await compression.decompressText(compressed);
console.log(original === largeText); // true

// ===== 压缩对象（JSON）=====
const data = {
  users: Array(1000).fill({ name: '张三', age: 25 }),
  timestamp: Date.now()
};

const compressedObj = await compression.compressObject(data);
const restored = await compression.decompressObject<typeof data>(compressedObj);

// ===== 压缩原始数据 =====
const uint8Array = new TextEncoder().encode(largeText);
const result = await compression.compress(uint8Array);
console.log({
  originalSize: result.originalSize,
  compressedSize: result.compressedSize,
  ratio: result.ratio + '%',
  algorithm: result.algorithm
});

// 解压
const decompressed = await compression.decompress(result.data);

// ===== 工具函数 =====
// 计算压缩率
const ratio = compression.getCompressionRatio(1000, 400);
console.log(`压缩率: ${ratio}%`); // 60%

// 格式化文件大小
console.log(compression.formatSize(1024));      // 1 KB
console.log(compression.formatSize(1024 * 1024)); // 1 MB

// ===== 快捷函数 =====
import { compressText, decompressText, compressObject, decompressObject } from './framework';

const compressed = await compressText(largeText);
const original = await decompressText(compressed);
```

---

## 项目结构

```
ai-dev-framework/
├── src/
│   └── framework/
│       ├── index.ts          # 统一入口（导出快捷函数）
│       ├── helper.ts         # 快捷创建函数
│       ├── types.ts          # 共享类型
│       ├── ai/               # AI 相关模块
│       │   ├── index.ts
│       │   ├── core.ts       # 框架核心
│       │   ├── ai-request.ts # AI 请求封装
│       │   ├── parser.ts     # 响应解析
│       │   ├── tokenize.ts   # Token 处理
│       │   ├── query_build.ts # 请求构建
│       │   ├── prompts/      # Prompt 管理
│       │   ├── providers/    # AI Provider
│       │   └── tools/        # 工具调用
│       ├── storages/         # 通用存储模块
│       │   ├── index.ts
│       │   ├── opfs.ts       # OPFS 存储
│       │   ├── local.ts      # LocalStorage
│       │   ├── memory.ts     # 内存存储
│       │   ├── compression.ts # 压缩解压
│       │   └── manager.ts    # 存储管理器
│       ├── requests/         # 通用请求模块
│       │   ├── index.ts
│       │   ├── adapters/     # 适配器
│       │   │   ├── fetch.ts
│       │   │   ├── axios.ts
│       │   │   └── external.ts
│       │   └── manager.ts
│       ├── indexeddb/        # IndexedDB ORM
│       │   ├── index.ts
│       │   ├── database.ts   # 数据库管理
│       │   ├── model.ts      # 模型基类
│       │   └── query.ts      # 查询构建器
│       ├── memory/           # 记忆系统
│       ├── agent/            # Agent 系统
│       │   ├── index.ts
│       │   ├── types.ts      # Agent 类型
│       │   ├── agent.ts      # Agent 核心
│       │   ├── prompts/      # Agent 专属 Prompts
│       │   └── tools/        # Agent 专属 Tools
│       ├── state/            # 状态管理
│       │   ├── index.ts
│       │   ├── types.ts      # 状态类型
│       │   ├── store.ts      # Store 核心
│       │   ├── slice.ts      # 切片管理
│       │   └── helper.ts     # 快捷函数
│       └── utils/            # 通用工具
│           ├── index.ts
│           ├── event.ts      # 事件总线
│           └── worker.ts     # Worker 管理
├── plugins/                  # 插件
│   ├── request-bridge.user.js         # 油猴脚本
│   └── chrome-extension/              # Chrome 插件
├── docs/                     # 任务管理文档（本地）
├── PROJECT.md                # 本文件
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 跨域请求解决方案

由于浏览器 CORS 限制，框架提供两种绕过方案：

### 方案一：油猴脚本

安装 `plugins/request-bridge.user.js` 到 Tampermonkey/Greasemonkey

### 方案二：Chrome 插件

1. 打开 Chrome 扩展管理页面 `chrome://extensions/`
2. 开启开发者模式
3. 加载已解压的扩展程序，选择 `plugins/chrome-extension/`

安装后，框架会自动检测并使用外部请求接口。

---

## 开发流程

本项目采用敏捷开发流程，使用 `docs/` 文件夹管理任务：

1. **规划中** → 创建任务文档
2. **进行中** → 开始开发
3. **待审查** → 提交代码，等待审查
4. **待处理修复** → Bug 和技术债务
5. **已完成** → 归档

**详细说明见 `docs/README.md`**

---

## 技术栈

- **TypeScript** 5.9+（严格模式）
- **Vite** 构建工具
- **OPFS** 浏览器文件系统
- **IndexedDB** 浏览器数据库
- **Fetch API** HTTP 请求

---

## 许可证

MIT

---

*AI PWA Kit - 构建下一代 AI 驱动的 Web 应用*