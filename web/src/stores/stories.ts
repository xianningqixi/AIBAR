import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listStories } from '@/api/stories'
import { getApiErrorMessage } from '@/api/client'
import type { StoryCard } from '@/api/types'

// 故事列表的唯一持有者：页面间导航复用缓存，保存/删除故事后由调用方 invalidate。
export const useStoriesStore = defineStore('stories', () => {
  const stories = ref<StoryCard[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')
  let requestVersion = 0
  let loadPromise: Promise<void> | null = null

  async function load(force = false) {
    if (loaded.value && !force) return
    if (loadPromise) return loadPromise
    const version = ++requestVersion
    loading.value = true
    error.value = ''
    const promise = (async () => {
      try {
        const result = await listStories()
        if (version === requestVersion) {
          stories.value = result
          loaded.value = true
        }
      } catch (e: unknown) {
        if (version === requestVersion) error.value = getApiErrorMessage(e, '故事列表加载失败')
      } finally {
        if (version === requestVersion) loading.value = false
        loadPromise = null
      }
    })()
    loadPromise = promise
    return promise
  }

  // 故事被创建/更新/删除后调用：下一次 load 会重新拉取
  function invalidate() {
    loaded.value = false
  }

  function reset() {
    requestVersion += 1
    loadPromise = null
    stories.value = []
    loading.value = false
    loaded.value = false
    error.value = ''
  }

  return { stories, loading, loaded, error, load, invalidate, reset }
})
