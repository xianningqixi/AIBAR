import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Character } from '@/api/types'
import { getApiErrorMessage } from '@/api/client'
import {
  fetchCharacters,
  toggleFavorite as toggleFavoriteApi,
  mergeAttributes,
} from '@/api/characters'

export const useCharactersStore = defineStore('characters', () => {
  const list = ref<Character[]>([])
  const loading = ref(false)
  const error = ref('')
  let requestVersion = 0
  let loadPromise: Promise<void> | null = null

  const characters = computed(() => list.value)

  function findCharacter(avatar: string): Character | undefined {
    return list.value.find((c) => c.avatar === avatar)
  }

  function upsertCharacter(character: Character) {
    const index = list.value.findIndex(item => item.avatar === character.avatar)
    if (index === -1) {
      list.value = [...list.value, character]
      return
    }
    list.value[index] = character
  }

  async function load() {
    // 多个页面会在挂载时并发调用 load，复用在途请求避免重复拉全量角色列表。
    if (loadPromise) return loadPromise
    const version = ++requestVersion
    loading.value = true
    error.value = ''
    const promise = (async () => {
      try {
        const characters = await fetchCharacters()
        if (version === requestVersion) list.value = characters
      } catch (e: unknown) {
        if (version === requestVersion) error.value = getApiErrorMessage(e, '角色列表加载失败')
      } finally {
        if (version === requestVersion) loading.value = false
        loadPromise = null
      }
    })()
    loadPromise = promise
    return promise
  }

  async function toggleFav(character: Character) {
    const version = requestVersion
    const next = await toggleFavoriteApi(character)
    if (version !== requestVersion) return
    const idx = list.value.findIndex((c) => c.avatar === character.avatar)
    if (idx !== -1) {
      list.value[idx] = {
        ...list.value[idx],
        fav: String(next),
      }
    }
  }

  async function updateTags(character: Character, tags: string[]) {
    const version = requestVersion
    await mergeAttributes(character.avatar, { tags, data: { tags } })
    if (version !== requestVersion) return
    const idx = list.value.findIndex((c) => c.avatar === character.avatar)
    if (idx !== -1) {
      list.value[idx] = { ...list.value[idx], tags }
    }
  }

  function reset() {
    requestVersion += 1
    list.value = []
    loading.value = false
    error.value = ''
  }

  return {
    list,
    loading,
    error,
    characters,
    findCharacter,
    upsertCharacter,
    load,
    toggleFav,
    updateTags,
    reset,
  }
})
