import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const ST = env.VITE_ST_BACKEND || 'http://localhost:8001'

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: ST,
          changeOrigin: false,
          configure: (proxy) => {
            proxy.on('proxyRes', (pr) => {
              pr.headers['x-accel-buffering'] = 'no'
            })
          },
        },
        '/csrf-token': {
          target: ST,
          changeOrigin: false,
        },
        '/thumbnail': {
          target: ST,
          changeOrigin: false,
        },
        '/characters': {
          target: ST,
          changeOrigin: false,
        },
        '/User Avatars': {
          target: ST,
          changeOrigin: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vue: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
            markdown: ['marked', 'dompurify'],
          },
        },
      },
    },
    base: process.env.NODE_ENV === 'production' ? '/aibar/' : '/',
  }
})
