import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // 默认 node 环境（lib/stores 的纯逻辑测试）；组件测试在文件头用
    // `// @vitest-environment jsdom` 按需切换，避免全量测试都背上 DOM 开销。
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
