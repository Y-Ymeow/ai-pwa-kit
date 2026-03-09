/**
 * State Slice
 * 状态切片管理
 */

import type { StateSlice, StateAction } from './types';
import { Store } from './store';

/**
 * 切片 Store
 * 将切片转换为独立的 Store API
 */
export class SliceStore<T> {
  private parentStore: Store<Record<string, unknown>>;
  private sliceName: string;

  constructor(
    parentStore: Store<Record<string, unknown>>,
    sliceName: string,
    initialState: T
  ) {
    this.parentStore = parentStore;
    this.sliceName = sliceName;

    // 初始化切片状态
    const currentState = parentStore.getState();
    if (!(sliceName in currentState)) {
      parentStore.setState({
        ...currentState,
        [sliceName]: initialState,
      } as Record<string, unknown>);
    }
  }

  /**
   * 获取切片状态
   */
  getState(): T {
    return this.parentStore.getState()[this.sliceName] as T;
  }

  /**
   * 设置切片状态
   */
  setState(updater: (prev: T) => T | Partial<T>): void {
    this.parentStore.setState((prev) => {
      const sliceState = prev[this.sliceName] as T;
      let newSliceState: T;

      if (typeof updater === 'function') {
        const result = (updater as (prev: T) => T | Partial<T>)(sliceState);
        newSliceState = typeof result === 'object' && result !== null && !Array.isArray(result)
          ? { ...sliceState, ...(result as Record<string, unknown>) } as T
          : result as T;
      } else {
        newSliceState = { ...sliceState, ...(updater as Record<string, unknown>) } as T;
      }

      return {
        ...prev,
        [this.sliceName]: newSliceState,
      };
    });
  }

  /**
   * 订阅切片变化
   */
  subscribe(callback: (newState: T, oldState: T) => void): () => void {
    let lastState = this.getState();

    return this.parentStore.subscribe((newParentState, oldParentState) => {
      const newSlice = newParentState[this.sliceName] as T;
      const oldSlice = oldParentState[this.sliceName] as T;

      if (JSON.stringify(newSlice) !== JSON.stringify(lastState)) {
        lastState = newSlice;
        callback(newSlice, oldSlice);
      }
    });
  }

  /**
   * 重置切片
   */
  reset(initialState: T): void {
    this.parentStore.setState((prev) => ({
      ...prev,
      [this.sliceName]: initialState,
    }));
  }
}

/**
 * 创建状态切片
 */
export function createSlice<T extends Record<string, unknown>>(
  config: StateSlice<T>
): {
  name: string;
  initialState: T;
  actions: Record<string, (payload?: unknown) => StateAction>;
  reducer: (state: T, action: StateAction) => T;
} {
  const { name, initialState, reducers = {} } = config;

  // 自动生成 actions
  const actions: Record<string, (payload?: unknown) => StateAction> = {};
  
  for (const actionName of Object.keys(reducers)) {
    actions[actionName] = (payload?: unknown) => ({
      type: `${name}/${actionName}`,
      payload,
    });
  }

  // 创建 reducer
  const reducer = (state: T = initialState, action: StateAction): T => {
    const actionName = action.type.split('/').pop();
    if (actionName && actionName in reducers) {
      return reducers[actionName](state, action.payload);
    }
    return state;
  };

  return {
    name,
    initialState,
    actions,
    reducer,
  };
}

/**
 * 组合多个切片
 */
export function combineSlices<T extends Record<string, unknown>>(
  slices: Record<string, ReturnType<typeof createSlice>>
): {
  initialState: T;
  reducers: Record<string, (state: unknown, action: StateAction) => unknown>;
} {
  const initialState = {} as T;
  const reducers: Record<string, (state: unknown, action: StateAction) => unknown> = {};

  for (const [key, slice] of Object.entries(slices)) {
    (initialState as Record<string, unknown>)[key] = slice.initialState;
    reducers[key] = slice.reducer as unknown as (state: unknown, action: StateAction) => unknown;
  }

  return { initialState, reducers };
}

/**
 * 创建带切片的 Store
 */
export function createStoreWithSlices<T extends Record<string, unknown>>(
  slices: Record<string, ReturnType<typeof createSlice>>,
  options?: {
    persist?: boolean;
    persistKey?: string;
  }
): Store<T> {
  const combined = combineSlices<T>(slices);
  
  const store = new Store<T>({
    initialState: combined.initialState,
    persist: options?.persist,
    persistKey: options?.persistKey,
  });

  // 注册 reducers
  for (const [key, reducer] of Object.entries(combined.reducers)) {
    store.registerReducer(`${key}/*`, (state, payload) => {
      const action = payload as StateAction;
      const sliceState = (state as Record<string, unknown>)[key];
      const newSliceState = reducer(sliceState, action);
      return {
        ...state,
        [key]: newSliceState,
      };
    });
  }

  return store;
}

/**
 * 创建计数器切片（示例）
 */
export const counterSlice = createSlice({
  name: 'counter',
  initialState: { value: 0 },
  reducers: {
    increment: (state) => ({ value: (state as { value: number }).value + 1 }),
    decrement: (state) => ({ value: (state as { value: number }).value - 1 }),
    add: (state, payload: unknown) => ({ value: (state as { value: number }).value + (payload as number) }),
    reset: () => ({ value: 0 }),
  },
});

/**
 * 创建用户信息切片（示例）
 */
export const userSlice = createSlice({
  name: 'user',
  initialState: {
    name: '',
    email: '',
    isLogin: false,
  },
  reducers: {
    setUser: (state, payload: unknown) => {
      const p = payload as { name: string; email: string };
      return {
        ...(state as { name: string; email: string; isLogin: boolean }),
        name: p.name,
        email: p.email,
        isLogin: true,
      };
    },
    logout: () => ({
      name: '',
      email: '',
      isLogin: false,
    }),
    updateName: (state, payload: unknown) => ({
      ...(state as { name: string; email: string; isLogin: boolean }),
      name: payload as string,
    }),
  },
});

/**
 * 创建主题切片（示例）
 */
export const themeSlice = createSlice({
  name: 'theme',
  initialState: {
    mode: 'light' as 'light' | 'dark',
    color: '#1890ff',
  },
  reducers: {
    toggle: (state) => ({
      ...(state as { mode: 'light' | 'dark'; color: string }),
      mode: (state as { mode: 'light' | 'dark'; color: string }).mode === 'light' ? 'dark' as const : 'light' as const,
    }),
    setMode: (state, payload: unknown) => {
      const s = state as { mode: 'light' | 'dark'; color: string };
      return {
        ...s,
        mode: payload as 'light' | 'dark',
      };
    },
    setColor: (state, payload: unknown) => ({
      ...(state as { mode: 'light' | 'dark'; color: string }),
      color: payload as string,
    }),
  },
});
