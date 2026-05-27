<script setup lang="ts">
import type { Character } from '@/api/types'
import CharacterCard from './CharacterCard.vue'
import AppSpinner from '../ui/AppSpinner.vue'
import AppEmpty from '../ui/AppEmpty.vue'

defineProps<{
  characters: Character[]
  loading?: boolean
  emptyText?: string
}>()

defineEmits<{
  select: [character: Character]
}>()
</script>

<template>
  <div v-if="loading" class="flex justify-center py-16">
    <AppSpinner size="lg" />
  </div>

  <AppEmpty
    v-else-if="characters.length === 0"
    icon="search"
    :title="emptyText || '没有找到角色'"
    description="尝试换个搜索词,或导入/新建一张角色卡。"
  />

  <div
    v-else
    class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5"
  >
    <CharacterCard
      v-for="char in characters"
      :key="char.avatar"
      :character="char"
      @click="$emit('select', char)"
    />
  </div>
</template>
