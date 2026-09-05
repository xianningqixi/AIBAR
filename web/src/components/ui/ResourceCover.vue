<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  src?: string
  title: string
  kind?: 'character' | 'story' | 'mod'
  eager?: boolean
}>()
const failed = ref(false)
watch(() => props.src, () => { failed.value = false })
</script>

<template>
  <div class="relative isolate overflow-hidden bg-surface-sunken">
    <img
      v-if="src && !failed && kind !== 'mod'"
      :key="src"
      :src="src"
      alt=""
      class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.035]"
      :loading="eager ? 'eager' : 'lazy'"
      :fetchpriority="eager ? 'high' : 'auto'"
      decoding="async"
      @error="failed = true"
    />
    <div v-else class="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-brand-soft p-3 text-brand-300" aria-hidden="true">
      <svg v-if="kind === 'mod'" class="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="m8 9-4 3 4 3m8-6 4 3-4 3M13 5l-2 14" />
      </svg>
      <span v-else class="text-4xl font-medium opacity-70">{{ title.trim().slice(0, 1) || 'A' }}</span>
      <span v-if="kind === 'mod'" class="text-xs tracking-widest">提示词 MOD</span>
    </div>
    <slot />
  </div>
</template>
