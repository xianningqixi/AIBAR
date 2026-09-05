import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listWorldInfo } from '@/api/worldInfo'
import { getApiErrorMessage } from '@/api/client'
import type { WorldInfoSummary } from '@/api/types'

// 世界书摘要列表的唯一持有者：聊天抽屉、编辑器、设置页共用一份缓存，
// 世界书增删改后由调用方 load(true) 刷新。
export const useWorldInfoStore = defineStore('worldInfo', () => {
  const worlds = ref<WorldInfoSummary[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')
  let requestVersion = 0
  let loadPromise: Promise<void> | null = null

  async function load(force = false) {
    if (loadPromise && !force) return loadPromise
    if (loaded.value && !force) return
    const version = ++requestVersion
    loading.value = true
    error.value = ''
    const promise = (async () => {
      try {
        const result = await listWorldInfo()
        if (version === requestVersion) {
          worlds.value = result
          loaded.value = true
        }
      } catch (e: unknown) {
        if (version === requestVersion) error.value = getApiErrorMessage(e, '世界书列表加载失败')
        throw e
      } finally {
        if (version === requestVersion) {
          loading.value = false
          loadPromise = null
        }
      }
    })()
    loadPromise = promise
    return promise
  }

  function reset() {
    requestVersion += 1
    loadPromise = null
    worlds.value = []
    loading.value = false
    loaded.value = false
    error.value = ''
  }

  return { worlds, loading, loaded, error, load, reset }
})
