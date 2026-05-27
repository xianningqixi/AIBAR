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

  const characters = computed(() => list.value)
  const favorites = computed(() => list.value.filter((c) => c.fav === 'true'))

  function findCharacter(avatar: string): Character | undefined {
    return list.value.find((c) => c.avatar === avatar)
  }

  async function load() {
    loading.value = true
    error.value = ''
    try {
      list.value = await fetchCharacters()
    } catch (e: any) {
      error.value = e.message || 'Failed to load characters'
    } finally {
      loading.value = false
    }
  }

  async function toggleFav(character: Character) {
    const next = await toggleFavoriteApi(character)
    const idx = list.value.findIndex((c) => c.avatar === character.avatar)
    if (idx !== -1) {
      list.value[idx] = {
        ...list.value[idx],
        fav: String(next),
      }
    }
  }

  async function updateTags(character: Character, tags: string[]) {
    await mergeAttributes(character.avatar, { tags, data: { tags } })
    const idx = list.value.findIndex((c) => c.avatar === character.avatar)
    if (idx !== -1) {
      list.value[idx] = { ...list.value[idx], tags }
    }
  }

  return { list, loading, error, characters, favorites, findCharacter, load, toggleFav, updateTags }
})
