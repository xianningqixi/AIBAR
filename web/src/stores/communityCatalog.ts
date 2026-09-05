import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listCommunityWorks, listCommunityWorkTags, type CommunityWork, type CommunityWorkTag, type CommunityWorkType } from '@/api/community'
import { getApiErrorMessage } from '@/api/client'

/** 社区目录的筛选、分页和加载状态；详情页返回时保留筛选条件。 */
export const useCommunityCatalogStore = defineStore('communityCatalog', () => {
  const works = ref<CommunityWork[]>([])
  const availableTags = ref<CommunityWorkTag[]>([])
  const search = ref('')
  const type = ref<'' | CommunityWorkType>('')
  const ranking = ref<'recommended' | 'recent' | 'daily' | 'weekly' | 'monthly' | 'all'>('recommended')
  const activeTag = ref('')
  const favoritesOnly = ref(false)
  const mineOnly = ref(false)
  const noImage = ref(false)
  const loading = ref(false)
  const loadingMore = ref(false)
  const hasMore = ref(false)
  const error = ref('')
  let page = 1
  let requestSequence = 0
  let tagSequence = 0

  async function loadWorks(append = false) {
    if (append && (loading.value || loadingMore.value || !hasMore.value)) return
    const requestId = ++requestSequence
    const requestedPage = append ? page + 1 : 1
    loading.value = !append
    loadingMore.value = append
    error.value = ''
    if (!append) {
      works.value = []
      hasMore.value = false
    }
    try {
      const result = await listCommunityWorks({ search: search.value, tag: activeTag.value, type: type.value, ranking: ranking.value, favoritesOnly: favoritesOnly.value, mineOnly: mineOnly.value, page: requestedPage })
      if (requestId !== requestSequence) return
      const ids = new Set(works.value.map(work => work.id))
      works.value = append ? [...works.value, ...result.works.filter(work => !ids.has(work.id))] : result.works
      page = result.page
      hasMore.value = result.hasMore
    } catch (e: unknown) {
      if (requestId === requestSequence) error.value = getApiErrorMessage(e, '社区暂时无法加载')
    } finally {
      if (requestId === requestSequence) {
        loading.value = false
        loadingMore.value = false
      }
    }
  }

  async function loadTags() {
    const requestId = ++tagSequence
    try {
      const result = await listCommunityWorkTags(type.value)
      if (requestId !== tagSequence) return
      availableTags.value = result.tags
      if (activeTag.value && !result.tags.some(item => item.tag === activeTag.value)) activeTag.value = ''
    } catch {
      if (requestId === tagSequence) availableTags.value = []
    }
  }

  function cancelWorks() {
    requestSequence += 1
    loading.value = false
    loadingMore.value = false
  }
  function cancel() {
    cancelWorks()
    tagSequence += 1
  }
  function clearFilters() {
    search.value = ''
    type.value = ''
    activeTag.value = ''
    favoritesOnly.value = false
    mineOnly.value = false
  }
  function reset() {
    cancel()
    clearFilters()
    ranking.value = 'recommended'
    noImage.value = false
    works.value = []
    availableTags.value = []
    error.value = ''
    hasMore.value = false
    page = 1
  }
  return { works, availableTags, search, type, ranking, activeTag, favoritesOnly, mineOnly, noImage, loading, loadingMore, hasMore, error, loadWorks, loadTags, cancelWorks, cancel, clearFilters, reset }
})
