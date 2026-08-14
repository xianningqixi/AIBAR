import '@/assets/main.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useUiStore } from '@/stores/ui'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

// 渲染期未捕获异常的全局兜底：不吞原始错误（保留堆栈供排查），
// 同时给用户一条可见提示，避免局部白屏后毫无反馈
app.config.errorHandler = (err, _instance, info) => {
  console.error(`[AIBAR] 未捕获的应用异常 (${info}):`, err)
  try {
    // 显式传 pinia 实例，避免 errorHandler 在无活跃 pinia 上下文时再次抛错
    useUiStore(pinia).addToast('页面出现异常，部分内容可能未正确显示，请刷新重试', 'error', 5000)
  } catch (toastError) {
    // toast 链路自身出错时只记录，绝不能在错误处理器里二次抛出
    console.error('[AIBAR] 错误提示展示失败:', toastError)
  }
}

app.mount('#app')
