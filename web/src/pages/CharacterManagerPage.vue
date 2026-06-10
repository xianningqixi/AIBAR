<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import {
  createCharacter,
  deleteCharacter,
  exportCharacter,
  importCharacter,
  mergeAttributes,
} from '@/api/characters'
import type { Character } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'

const router = useRouter()
const route = useRoute()
const chars = useCharactersStore()
const ui = useUiStore()

const filter = ref(typeof route.query.q === 'string' ? route.query.q : '')

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return chars.characters
  return chars.characters.filter((c) => {
    const tags = c.tags?.length ? c.tags : c.data?.tags || []
    return (
      c.name.toLowerCase().includes(q) ||
      (c.description || c.data?.description || '').toLowerCase().includes(q) ||
      tags.some((t) => t.toLowerCase().includes(q))
    )
  })
})

async function removeCharacter(avatar: string, name: string) {
  if (!window.confirm(`删除角色「${name}」及其聊天记录？`)) return
  try {
    await deleteCharacter(avatar)
    ui.addToast('角色已删除', 'success')
    await chars.load()
  } catch (e: any) {
    ui.addToast(`删除失败：${e.message}`, 'error')
  }
}

async function exportCard(avatar: string, format: 'png' | 'json') {
  try {
    const blob = await exportCharacter(avatar, format)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = avatar.replace(/\.png$/i, `.${format}`)
    link.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    ui.addToast(`导出失败：${e.message}`, 'error')
  }
}

async function importCards() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.png,.json,.yaml,.yml,.charx,.byaf'
  input.multiple = true
  input.onchange = async () => {
    const files = input.files
    if (!files?.length) return
    for (const file of files) {
      try {
        await importCharacter(file)
        ui.addToast(`已导入：${file.name}`, 'success')
      } catch (e: any) {
        ui.addToast(`导入失败：${e.message}`, 'error')
      }
    }
    await chars.load()
  }
  input.click()
}

async function duplicate(character: Character) {
  const newName = window.prompt('副本角色名', `${character.name} 副本`)
  if (!newName?.trim()) return
  try {
    const trimmed = newName.trim()
    const next = {
      ch_name: trimmed,
      description: character.description || character.data?.description || '',
      personality: character.personality || character.data?.personality || '',
      scenario: character.scenario || character.data?.scenario || '',
      first_mes: character.data?.first_mes || '',
      mes_example: character.mes_example || character.data?.mes_example || '',
      creator_notes: character.data?.creator_notes || '',
      tags: (character.tags || character.data?.tags || []).join(', '),
      creator: character.data?.creator || '',
      character_version: character.data?.character_version || '',
      system_prompt: character.data?.system_prompt || '',
      post_history_instructions: character.data?.post_history_instructions || '',
      alternate_greetings: (character.data?.alternate_greetings || []).join('\n'),
      world: character.data?.world || '',
    }
    await createCharacter(next)
    ui.addToast('已创建副本', 'success')
    await chars.load()
  } catch (e: any) {
    ui.addToast(`复制失败：${e.message}`, 'error')
  }
}

async function quickTagEdit(character: Character) {
  const current = (character.tags || character.data?.tags || []).join(', ')
  const next = window.prompt(`编辑「${character.name}」的标签 (逗号分隔)`, current)
  if (next === null) return
  const arr = next
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  try {
    await chars.updateTags(character, arr)
    ui.addToast('标签已更新', 'success')
  } catch (e: any) {
    ui.addToast(`保存失败：${e.message}`, 'error')
  }
}

async function toggleFav(character: Character) {
  try {
    await chars.toggleFav(character)
  } catch (e: any) {
    ui.addToast(`收藏失败：${e.message}`, 'error')
  }
}

async function setAsCurrent(character: Character) {
  try {
    await mergeAttributes(character.avatar, {})
    ui.addToast(`已切到「${character.name}」`, 'success')
    router.push(`/chat/${encodeURIComponent(character.avatar)}`)
  } catch (e: any) {
    ui.addToast(`失败：${e.message}`, 'error')
  }
}

onMounted(async () => {
  if (!chars.characters.length) {
    await chars.load()
  }
})
</script>

<template>
  <div class="min-h-screen bg-bg">
    <AppPageHeader title="角色管理" :subtitle="`${chars.characters.length} 个角色`" back-to="/browse" mobile-only-back>
      <template #actions>
        <AppButton variant="secondary" size="sm" @click="importCards">导入</AppButton>
        <AppButton variant="secondary" size="sm" @click="router.push('/hub')">社区导入</AppButton>
        <AppButton variant="gradient" size="sm" @click="router.push('/character/new')">+ 新建</AppButton>
      </template>
    </AppPageHeader>

    <main class="max-w-6xl mx-auto px-5 py-6 space-y-4 animate-fade-in-up">
      <section class="relative overflow-hidden rounded-2xl ring-1 ring-border-subtle bg-hero-radial">
        <div class="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />
        <div class="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-accent-500/15 blur-3xl pointer-events-none" />
        <div class="relative grid md:grid-cols-[1fr_auto] gap-5 items-end p-5 md:p-7">
          <div>
            <p class="text-[11px] uppercase tracking-[0.2em] text-brand-300/80 mb-2">角色库</p>
            <h2 class="text-xl md:text-2xl font-semibold text-ink-primary">
              管理你的 <span class="text-brand-300">{{ chars.characters.length }}</span> 个角色卡
            </h2>
            <p class="mt-1.5 text-xs md:text-sm text-ink-secondary">
              导入 PNG / JSON / YAML / charx,所有数据写入 ST 原生角色目录,与原版 UI 兼容。
            </p>
          </div>
          <div class="grid grid-cols-3 gap-2.5 md:min-w-[280px]">
            <div class="rounded-xl bg-surface/70 backdrop-blur ring-1 ring-border-subtle p-3 text-center">
              <p class="text-[10px] uppercase tracking-wider text-ink-muted">总数</p>
              <p class="mt-1 text-xl font-semibold text-ink-primary tabular-nums">{{ chars.characters.length }}</p>
            </div>
            <div class="rounded-xl bg-surface/70 backdrop-blur ring-1 ring-border-subtle p-3 text-center">
              <p class="text-[10px] uppercase tracking-wider text-ink-muted">收藏</p>
              <p class="mt-1 text-xl font-semibold text-accent-300 tabular-nums">{{ chars.characters.filter((c) => c.fav === 'true').length }}</p>
            </div>
            <div class="rounded-xl bg-surface/70 backdrop-blur ring-1 ring-border-subtle p-3 text-center">
              <p class="text-[10px] uppercase tracking-wider text-ink-muted">命中</p>
              <p class="mt-1 text-xl font-semibold text-brand-300 tabular-nums">{{ filtered.length }}</p>
            </div>
          </div>
        </div>
      </section>

      <div class="max-w-md">
        <AppInput v-model="filter" placeholder="过滤名称 / 描述 / 标签">
          <template #prefix>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </template>
        </AppInput>
      </div>

      <div v-if="chars.loading" class="flex justify-center py-16">
        <AppSpinner size="lg" />
      </div>
      <AppEmpty
        v-else-if="chars.characters.length === 0"
        title="暂无角色"
        description="先从导入或新建开始。"
      >
        <template #actions>
          <AppButton variant="secondary" size="sm" @click="importCards">导入角色</AppButton>
          <AppButton variant="secondary" size="sm" @click="router.push('/hub')">社区导入</AppButton>
          <AppButton size="sm" @click="router.push('/character/new')">+ 新建角色</AppButton>
        </template>
      </AppEmpty>
      <AppEmpty
        v-else-if="filtered.length === 0"
        icon="search"
        title="没有匹配的角色"
        description="换个关键词试试。"
      />
      <AppCard v-else padding="none">
        <div
          v-for="(character, idx) in filtered"
          :key="character.avatar"
          :class="[
            'group grid md:grid-cols-[1fr_auto] gap-3 px-4 py-3.5 items-center transition-colors hover:bg-ink-primary/[0.03]',
            idx !== 0 ? 'border-t border-border-subtle' : '',
          ]"
        >
          <div class="flex items-center gap-3 min-w-0">
            <img
              v-if="character.avatar && character.avatar !== 'none'"
              :src="`/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}`"
              class="w-12 h-12 rounded-lg object-cover shrink-0 ring-1 ring-border-subtle group-hover:ring-brand-500/40 transition-all cursor-pointer"
              loading="lazy"
              @click="router.push(`/character/${encodeURIComponent(character.avatar)}`)"
            />
            <div v-else class="w-12 h-12 rounded-lg bg-brand-soft ring-1 ring-border-subtle shrink-0 flex items-center justify-center text-brand-300">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <h2 class="text-sm font-semibold text-ink-primary truncate">{{ character.name }}</h2>
                <button
                  class="text-xs shrink-0"
                  :class="character.fav === 'true' ? 'text-rose-400' : 'text-ink-muted hover:text-ink-secondary'"
                  :title="character.fav === 'true' ? '取消收藏' : '加入收藏'"
                  @click="toggleFav(character)"
                >{{ character.fav === 'true' ? '★' : '☆' }}</button>
                <span class="text-[10px] text-ink-muted shrink-0">{{ character.chat_size || 0 }} 条聊天</span>
              </div>
              <p class="mt-0.5 text-xs text-ink-muted line-clamp-2 leading-relaxed">
                {{ character.description || character.data?.description || '无描述' }}
              </p>
              <div v-if="(character.tags || character.data?.tags || []).length" class="mt-1.5 flex flex-wrap gap-1">
                <span
                  v-for="tag in (character.tags || character.data?.tags || []).slice(0, 6)"
                  :key="tag"
                  class="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-300"
                >{{ tag }}</span>
                <button
                  class="text-[10px] px-1.5 py-0.5 rounded ring-1 ring-border-subtle text-ink-muted hover:text-ink-secondary"
                  @click="quickTagEdit(character)"
                >编辑</button>
              </div>
              <button
                v-else
                class="mt-1.5 text-[10px] text-ink-muted hover:text-ink-secondary"
                @click="quickTagEdit(character)"
              >+ 添加标签</button>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-1.5 text-xs">
            <AppButton size="sm" variant="ghost" @click="router.push(`/character/${encodeURIComponent(character.avatar)}`)">详情</AppButton>
            <AppButton size="sm" variant="ghost" @click="setAsCurrent(character)">设为当前</AppButton>
            <AppButton size="sm" variant="ghost" @click="router.push(`/character/${encodeURIComponent(character.avatar)}/edit`)">编辑</AppButton>
            <AppButton size="sm" variant="ghost" @click="duplicate(character)">复制</AppButton>
            <AppButton size="sm" variant="ghost" @click="exportCard(character.avatar, 'png')">PNG</AppButton>
            <AppButton size="sm" variant="ghost" @click="exportCard(character.avatar, 'json')">JSON</AppButton>
            <AppButton size="sm" variant="danger" @click="removeCharacter(character.avatar, character.name)">删除</AppButton>
          </div>
        </div>
      </AppCard>
    </main>
  </div>
</template>
