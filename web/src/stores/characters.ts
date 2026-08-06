import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Character } from '@/api/types'
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

  const characters = computed(() => list.value)
  const favorites = computed(() => list.value.filter((c) => c.fav === 'true'))

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
    const version = ++requestVersion
    loading.value = true
    error.value = ''
    try {
      const characters = await fetchCharacters()
      if (version === requestVersion) list.value = characters
    } catch (e: any) {
      if (version === requestVersion) error.value = e.message || 'Failed to load characters'
    } finally {
      if (version === requestVersion) loading.value = false
    }
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
    favorites,
    findCharacter,
    upsertCharacter,
    load,
    toggleFav,
    updateTags,
    reset,
  }
})
