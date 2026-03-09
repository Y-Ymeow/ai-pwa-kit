import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      // 这里的 resolve(__dirname, '...') 在某些环境下可能有问题，
      // 但在标准的 Vite 配置中是正确的。
      entry: resolve(__dirname, 'src/framework/index.ts'),
      name: 'AIPWAKit',
      fileName: 'ai-pwa-kit',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      // 如果有外部依赖，可以在这里添加
      external: [],
      output: {
        globals: {
          // 这里可以指定 UMD 格式下的全局变量
        },
      },
    },
  },
});
