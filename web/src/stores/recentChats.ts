import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchRecentChats } from '@/api/chats'
import { getApiErrorMessage } from '@/api/client'
import type { ChatEntry } from '@/api/types'

/** 首页只读最近预览；进入聊天列表后才读取完整列表。账号切换会丢弃旧请求。 */
export const useRecentChatsStore = defineStore('recentChats', () => {
  const entries = ref<ChatEntry[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const fullLoaded = ref(false)
  const error = ref('')
  let epoch = 0
  let pending: Promise<void> | null = null
  let pendingFull = false

  async function load(full = false, force = false) {
    if (!force) {
      if (pending && (!full || pendingFull)) return pending
      if (fullLoaded.value || (loaded.value && !full)) return
    }
    const current = ++epoch
    pendingFull = full
    loading.value = true
    error.value = ''
    const promise = (async () => {
      try {
        const result = await fetchRecentChats(full ? 500 : 60)
        if (current !== epoch) return
        entries.value = result
        loaded.value = true
        fullLoaded.value = full
      } catch (e: unknown) {
        if (current === epoch) error.value = getApiErrorMessage(e, '聊天记录加载失败')
      } finally {
        if (current === epoch) {
          loading.value = false
          pending = null
        }
      }
    })()
    pending = promise
    return promise
  }

  function reset() {
    epoch += 1
    pending = null
    pendingFull = false
    entries.value = []
    loading.value = false
    loaded.value = false
    fullLoaded.value = false
    error.value = ''
  }
  return { entries, loading, loaded, fullLoaded, error, load, reset }
})
