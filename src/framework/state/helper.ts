/**
 * State Helper Functions
 * 状态管理快捷函数
 */

import { Store, getGlobalStore } from './store';
import { createSlice, SliceStore } from './slice';
import type { StateConfig, StateSubscriber } from './types';

/**
 * 创建简单状态（类似 React useState，但跨框架）
 * @param initialValue 初始值
 * @param key 状态键名（用于全局识别）
 */
export function useState<T>(
  initialValue: T,
  key: string
): [
  () => T,
  (value: T | ((prev: T) => T)) => void,
  (callback: StateSubscriber<T>) => () => void
] {
  const store = getGlobalStore<{ [k: string]: T }>(key, {
    initialState: { [key]: initialValue } as { [k: string]: T },
  });

  const getState = () => store.getState()[key];
  const setState = (value: T | ((prev: T) => T)) => {
    if (typeof value === 'function') {
      store.setState((prev) => ({
        ...prev,
        [key]: (value as (prev: T) => T)(prev[key]),
      }));
    } else {
      store.setState({ [key]: value } as { [k: string]: T });
    }
  };
  const subscribe = (callback: StateSubscriber<T>) => {
    return store.watch(key as keyof { [k: string]: T }, callback as StateSubscriber<T>);
  };

  return [getState, setState, subscribe];
}

/**
 * 创建全局状态
 * @param config Store 配置
 */
export function useGlobalState<T extends Record<string, unknown>>(
  config: StateConfig<T> & { name: string }
): Store<T> {
  return getGlobalStore<T>(config.name, config) as Store<T>;
}

/**
 * 创建响应式状态（带计算属性）
 * @param initialState 初始状态
 * @param computed 计算属性定义
 */
export function createReactiveState<T extends Record<string, unknown>, C extends Record<string, unknown>>(
  initialState: T,
  computed: Record<keyof C, (state: T) => C[keyof C]>
): {
  getState: () => T & C;
  setState: (updater: Partial<T> | ((prev: T) => Partial<T>)) => void;
  subscribe: (callback: (state: T & C) => void) => () => void;
} {
  const store = new Store({ initialState });
  const computedCache = new Map<string, unknown>();

  const getComputedState = (): T & C => {
    const state = store.getState();
    const computedState = { ...state } as T & C;

    for (const [key, fn] of Object.entries(computed)) {
      const newValue = fn(state);
      const cachedValue = computedCache.get(key);

      if (cachedValue !== newValue) {
        computedCache.set(key, newValue);
      }

      (computedState as Record<string, unknown>)[key] = newValue;
    }

    return computedState;
  };

  return {
    getState: getComputedState,
    setState: (updater) => {
      if (typeof updater === 'function') {
        store.setState((prev) => ({ ...prev, ...(updater as (prev: T) => Partial<T>)(prev) }));
      } else {
        store.setState(updater);
      }
    },
    subscribe: (callback) => {
      return store.subscribe(() => {
        callback(getComputedState());
      });
    },
  };
}

/**
 * 初始化 Store
 * @param config Store 配置
 */
export function initStore<T extends Record<string, unknown>>(
  config: StateConfig<T>
): Store<T> {
  return new Store(config);
}

/**
 * 初始化全局 Store
 * @param name Store 名称
 * @param config Store 配置
 */
export function initGlobalStore<T extends Record<string, unknown>>(
  name: string,
  config: Omit<StateConfig<T>, 'persistKey'>
): Store<T> {
  return getGlobalStore(name, {
    ...config,
    persistKey: name,
  });
}

/**
 * 创建持久化 Store
 * @param key 持久化键名
 * @param initialState 初始状态
 * @param mode 持久化模式
 */
export function createPersistedStore<T extends Record<string, unknown>>(
  key: string,
  initialState: T,
  mode: 'localStorage' | 'sessionStorage' | 'memory' = 'localStorage'
): Store<T> {
  return new Store({
    initialState,
    persist: true,
    persistKey: key,
    persistMode: mode,
  });
}

/**
 * 初始化切片
 * @param store 父 Store
 * @param name 切片名称
 * @param initialState 初始状态
 */
export function initSlice<T>(
  store: Store<Record<string, unknown>>,
  name: string,
  initialState: T
): SliceStore<T> {
  return new SliceStore(store, name, initialState);
}

/**
 * 快速创建用户切片
 */
export function createUserSlice() {
  return createSlice({
    name: 'user',
    initialState: {
      id: '',
      name: '',
      email: '',
      avatar: '',
      isLogin: false,
      permissions: [] as string[],
    },
    reducers: {
      setUser: (state, payload: unknown) => {
        const p = payload as { id: string; name: string; email: string; avatar?: string };
        return {
          ...state,
          ...p,
          isLogin: true,
        };
      },
      updateProfile: (state, payload: unknown) => ({
        ...state,
        ...(payload as Partial<typeof state>),
      }),
      setPermissions: (state, payload: unknown) => ({
        ...state,
        permissions: payload as string[],
      }),
      logout: () => ({
        id: '',
        name: '',
        email: '',
        avatar: '',
        isLogin: false,
        permissions: [],
      }),
    },
  });
}

/**
 * 快速创建主题切片
 */
export function createThemeSlice() {
  return createSlice({
    name: 'theme',
    initialState: {
      mode: 'light' as 'light' | 'dark' | 'auto',
      primaryColor: '#1890ff',
      fontSize: 14,
      compact: false,
    },
    reducers: {
      setMode: (state, payload: unknown) => ({
        ...state,
        mode: payload as 'light' | 'dark' | 'auto',
      }),
      toggleMode: (state, payload: unknown) => {
        const s = state as { mode: 'light' | 'dark' | 'auto'; primaryColor: string; fontSize: number; compact: boolean };
        const newMode = s.mode === 'light' ? 'dark' as const : 'light' as const;
        return {
          ...s,
          mode: newMode,
        };
      },
      setPrimaryColor: (state, payload: unknown) => ({
        ...state,
        primaryColor: payload as string,
      }),
      setFontSize: (state, payload: unknown) => ({
        ...state,
        fontSize: payload as number,
      }),
      toggleCompact: (state) => ({
        ...state,
        compact: !state.compact,
      }),
    },
  });
}

/**
 * 快速创建计数器切片
 */
export function createCounterSlice() {
  return createSlice({
    name: 'counter',
    initialState: {
      value: 0,
      step: 1,
      history: [] as number[],
    },
    reducers: {
      increment: (state) => {
        const newValue = state.value + state.step;
        return {
          ...state,
          value: newValue,
          history: [...state.history, newValue],
        };
      },
      decrement: (state) => {
        const newValue = state.value - state.step;
        return {
          ...state,
          value: newValue,
          history: [...state.history, newValue],
        };
      },
      add: (state, payload: unknown) => {
        const newValue = state.value + (payload as number);
        return {
          ...state,
          value: newValue,
          history: [...state.history, newValue],
        };
      },
      setStep: (state, payload: unknown) => ({
        ...state,
        step: payload as number,
      }),
      reset: (state) => ({
        ...state,
        value: 0,
        history: [],
      }),
      clearHistory: (state) => ({
        ...state,
        history: [],
      }),
    },
  });
}

/**
 * 连接 React Hook（如果需要 React 支持）
 * 这是一个示例，展示如何与 React 集成
 */
export function createReactHook<T extends Record<string, unknown>>(store: Store<T>) {
  return function useStore(): [T, (updater: Partial<T> | ((prev: T) => Partial<T>)) => void] {
    const [state, setState] = (globalThis as { React?: { useState: (init: T) => [T, (s: T) => void] } }).React?.useState?.(store.getState()) || [store.getState(), () => {}];

    (globalThis as { React?: { useEffect: (fn: () => void | (() => void), deps: unknown[]) => void } }).React?.useEffect?.(() => {
      return store.subscribe((newState) => {
        setState(newState);
      });
    }, []);

    const setStoreState = (updater: Partial<T> | ((prev: T) => Partial<T>)) => {
      store.setState(updater as Partial<T>);
    };

    return [state, setStoreState];
  };
}

/**
 * 创建状态选择器 Hook
 * @param store Store 实例
 * @param selector 选择器函数
 */
export function createSelectorHook<T extends Record<string, unknown>, R>(
  store: Store<T>,
  selector: (state: T) => R
): () => R {
  return () => {
    const [value, setValue] = (globalThis as { React?: { useState: (init: R) => [R, (s: R) => void] } }).React?.useState?.(selector(store.getState())) || [selector(store.getState()), () => {}];

    (globalThis as { React?: { useEffect: (fn: () => void | (() => void), deps: unknown[]) => void } }).React?.useEffect?.(() => {
      return store.subscribe((newState) => {
        setValue(selector(newState));
      });
    }, []);

    return value;
  };
}
