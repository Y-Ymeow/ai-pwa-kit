/**
 * State Module
 * 跨框架全局状态管理
 *
 * @example
 * ```typescript
 * import {
 *   createStore,
 *   createSlice,
 *   useState,
 *   counterSlice,
 *   userSlice
 * } from './framework/state';
 *
 * // 方式一：简单 Store
 * const store = createStore({
 *   initialState: { count: 0, user: null },
 *   persist: true,
 *   persistKey: 'my-app-state'
 * });
 *
 * // 订阅状态
 * store.subscribe((newState, oldState) => {
 *   console.log('State changed:', newState);
 * });
 *
 * // 更新状态
 * store.setState({ count: 1 });
 *
 * // 方式二：使用切片
 * const slice = createSlice({
 *   name: 'counter',
 *   initialState: { value: 0 },
 *   reducers: {
 *     increment: (state) => ({ value: state.value + 1 }),
 *     add: (state, payload) => ({ value: state.value + payload })
 *   }
 * });
 *
 * // 使用 Action
 * store.dispatch(slice.actions.increment());
 * store.dispatch(slice.actions.add(5));
 *
 * // 方式三：快速使用
 * const [getCount, setCount, subscribeCount] = useState(0, 'count');
 * subscribeCount((newVal, oldVal) => {
 *   console.log('Count:', newVal);
 * });
 * setCount(10);
 * ```
 */

// 类型导出
export type {
  StateSubscriber,
  StateSelector,
  StateUpdater,
  StateAction,
  StateReducer,
  StateMiddleware,
  StateConfig,
  StateSlice,
  StoreAPI,
  GlobalStateConfig,
  StateChangeInfo,
  PersistStorage,
  StateHooks,
  DerivedStateConfig,
  CompareOptions,
} from './types';

// Store
export {
  Store,
  createStore,
  getGlobalStore,
  removeGlobalStore,
  listGlobalStores,
} from './store';

// 切片
export {
  SliceStore,
  createSlice,
  combineSlices,
  createStoreWithSlices,
  // 示例切片
  counterSlice,
  userSlice,
  themeSlice,
} from './slice';

// 快捷函数
export {
  // 状态创建
  useState,
  useGlobalState,
  createReactiveState,
  // Store 创建
  initStore,
  initGlobalStore,
  createPersistedStore,
  // 切片创建
  initSlice,
  createUserSlice,
  createThemeSlice,
  createCounterSlice,
} from './helper';
