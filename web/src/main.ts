import '@/assets/main.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useSessionStore } from './stores/session'

const app = createApp(App)
app.use(createPinia())
app.use(router)

router.beforeEach(async (_to, _from, next) => {
  const session = useSessionStore()
  if (!session.csrfToken) {
    await session.boot()
  }
  next()
})

app.mount('#app')
