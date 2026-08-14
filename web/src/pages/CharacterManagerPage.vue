<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
import { getApiErrorMessage } from '@/api/client'
import { parseTags } from '@/lib/format'
import { confirmDialog, promptDialog } from '@/composables/useDialog'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import SearchInput from '@/components/ui/SearchInput.vue'

const router = useRouter()
const route = useRoute()
const chars = useCharactersStore()
const ui = useUiStore()

const filter = ref(typeof route.query.q === 'string' ? route.query.q : '')

// 行内溢出菜单：一次只展开一行，按 avatar 记录
const openMenu = ref('')

function toggleMenu(avatar: string) {
  openMenu.value = openMenu.value === avatar ? '' : avatar
}

function runMenuAction(action: () => void) {
  openMenu.value = ''
  action()
}

function onMenuKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') openMenu.value = ''
}

const favoriteCount = computed(() => chars.characters.filter((c) => c.fav === 'true').length)

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
  if (!await confirmDialog({ title: '删除角色', message: `删除角色「${name}」及其聊天记录？`, danger: true, confirmText: '删除' })) return
  try {
    await deleteCharacter(avatar)
    ui.addToast('角色已删除', 'success')
    await chars.load()
  } catch (e: unknown) {
    ui.addToast(`删除失败：${getApiErrorMessage(e)}`, 'error')
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
  } catch (e: unknown) {
    ui.addToast(`导出失败：${getApiErrorMessage(e)}`, 'error')
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
      } catch (e: unknown) {
        ui.addToast(`导入失败：${getApiErrorMessage(e)}`, 'error')
      }
    }
    await chars.load()
  }
  input.click()
}

async function duplicate(character: Character) {
  const newName = await promptDialog({ title: '副本角色名', defaultValue: `${character.name} 副本` })
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
  } catch (e: unknown) {
    ui.addToast(`复制失败：${getApiErrorMessage(e)}`, 'error')
  }
}

async function quickTagEdit(character: Character) {
  const current = (character.tags || character.data?.tags || []).join(', ')
  const next = await promptDialog({ title: `编辑「${character.name}」的标签 (逗号分隔)`, defaultValue: current })
  if (next === null) return
  const arr = parseTags(next)
  try {
    await chars.updateTags(character, arr)
    ui.addToast('标签已更新', 'success')
  } catch (e: unknown) {
    ui.addToast(`保存失败：${getApiErrorMessage(e)}`, 'error')
  }
}

async function toggleFav(character: Character) {
  try {
    await chars.toggleFav(character)
  } catch (e: unknown) {
    ui.addToast(`收藏失败：${getApiErrorMessage(e)}`, 'error')
  }
}

async function setAsCurrent(character: Character) {
  try {
    await mergeAttributes(character.avatar, {})
    ui.addToast(`已切到「${character.name}」`, 'success')
    router.push(`/chat/${encodeURIComponent(character.avatar)}`)
  } catch (e: unknown) {
    ui.addToast(`失败：${getApiErrorMessage(e)}`, 'error')
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onMenuKeydown)
  if (!chars.characters.length) {
    await chars.load()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onMenuKeydown)
})
</script>

<template>
  <div class="min-h-[100dvh] bg-bg">
    <AppPageHeader title="角色管理" :subtitle="`${chars.characters.length} 个角色`" back-to="/browse" mobile-only-back>
      <template #actions>
        <AppButton variant="secondary" size="sm" @click="importCards">导入</AppButton>
        <AppButton variant="secondary" size="sm" @click="router.push('/hub')">社区导入</AppButton>
        <AppButton variant="gradient" size="sm" @click="router.push('/character/new')">+ 新建</AppButton>
      </template>
    </AppPageHeader>

    <main class="mx-auto max-w-6xl space-y-6 px-5 py-6 animate-fade-in-up md:px-8 lg:px-10">
      <!-- 不再重复一个大 hero：标题交给 AppPageHeader，这里只留一条紧凑统计 -->
      <div class="flex flex-wrap items-center gap-x-6 gap-y-1">
        <span class="text-sm text-ink-secondary">总数 <span class="ml-1 font-semibold tabular-nums text-ink-primary">{{ chars.characters.length }}</span></span>
        <span class="text-sm text-ink-secondary">收藏 <span class="ml-1 font-semibold tabular-nums text-accent-300">{{ favoriteCount }}</span></span>
        <p class="text-xs text-ink-muted">导入 PNG / JSON / YAML / charx，数据写入 ST 原生角色目录。</p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <div class="min-w-0 max-w-md flex-1">
          <SearchInput v-model="filter" placeholder="过滤名称 / 描述 / 标签" />
        </div>
        <p class="shrink-0 text-sm text-ink-muted">共 {{ filtered.length }} 个角色</p>
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
                <span class="text-[11px] text-ink-muted shrink-0">{{ character.chat_size || 0 }} 条聊天</span>
              </div>
              <p class="mt-0.5 text-xs text-ink-muted line-clamp-2 leading-relaxed">
                {{ character.description || character.data?.description || '无描述' }}
              </p>
              <div v-if="(character.tags || character.data?.tags || []).length" class="mt-1.5 flex flex-wrap gap-1">
                <span
                  v-for="tag in (character.tags || character.data?.tags || []).slice(0, 6)"
                  :key="tag"
                  class="text-[11px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-300"
                >{{ tag }}</span>
                <button
                  class="text-[11px] px-1.5 py-0.5 rounded ring-1 ring-border-subtle text-ink-muted hover:text-ink-secondary"
                  @click="quickTagEdit(character)"
                >编辑</button>
              </div>
              <button
                v-else
                class="mt-1.5 text-[11px] text-ink-muted hover:text-ink-secondary"
                @click="quickTagEdit(character)"
              >+ 添加标签</button>
            </div>
          </div>
          <!-- 常用两项常驻，其余收进溢出菜单，行高不再被按钮换行撑开 -->
          <div class="relative flex shrink-0 items-center gap-1.5 text-xs">
            <AppButton size="sm" variant="ghost" @click="router.push(`/character/${encodeURIComponent(character.avatar)}`)">详情</AppButton>
            <AppButton size="sm" variant="ghost" @click="router.push(`/character/${encodeURIComponent(character.avatar)}/edit`)">编辑</AppButton>
            <button
              class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-ink-primary/5 hover:text-ink-primary"
              :class="openMenu === character.avatar ? 'bg-ink-primary/5 text-ink-primary' : ''"
              aria-haspopup="menu"
              :aria-expanded="openMenu === character.avatar"
              aria-label="更多操作"
              @click="toggleMenu(character.avatar)"
            >
              <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="5" r="1.75" />
                <circle cx="12" cy="12" r="1.75" />
                <circle cx="12" cy="19" r="1.75" />
              </svg>
            </button>
            <template v-if="openMenu === character.avatar">
              <!-- 透明遮罩负责「点击外部关闭」 -->
              <div class="fixed inset-0 z-30" @click="openMenu = ''" />
              <div
                role="menu"
                class="absolute right-0 top-full z-40 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-surface-elevated py-1 shadow-elevated"
              >
                <button role="menuitem" class="row-menu-item" @click="runMenuAction(() => setAsCurrent(character))">设为当前</button>
                <button role="menuitem" class="row-menu-item" @click="runMenuAction(() => duplicate(character))">复制副本</button>
                <button role="menuitem" class="row-menu-item" @click="runMenuAction(() => exportCard(character.avatar, 'png'))">导出 PNG</button>
                <button role="menuitem" class="row-menu-item" @click="runMenuAction(() => exportCard(character.avatar, 'json'))">导出 JSON</button>
                <div class="my-1 h-px bg-border-subtle" />
                <button
                  role="menuitem"
                  class="row-menu-item text-red-500 hover:text-red-600"
                  @click="runMenuAction(() => removeCharacter(character.avatar, character.name))"
                >
                  删除角色
                </button>
              </div>
            </template>
          </div>
        </div>
      </AppCard>
    </main>
  </div>
</template>

<style scoped>
.row-menu-item {
  @apply block w-full px-3 py-2 text-left text-xs text-ink-secondary transition-colors hover:bg-ink-primary/5 hover:text-ink-primary;
}
</style>
