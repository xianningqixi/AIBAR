<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { useModsStore } from '@/stores/mods'
import {
  deleteCharacter,
  exportCharacter,
  fetchCharacter,
  fetchCharacterChats,
  mergeAttributes,
} from '@/api/characters'
import { useStoriesStore } from '@/stores/stories'
import { createChatFromCharacter, createChatFromStory } from '@/lib/storyStart'
import { characterGreetings, saveStoryFromCharacterGreeting } from '@/lib/storyFromCharacter'
import { formatDateTime, parseTags, stripJsonlName } from '@/lib/format'
import { confirmDialog, promptDialog } from '@/composables/useDialog'
import { getApiErrorMessage } from '@/api/client'
import type { Character, CharacterStartSelection, ChatEntry, StoryCard } from '@/api/types'
import CharacterStartDialog from '@/components/chat/CharacterStartDialog.vue'
import StCompatibilityDialog from '@/components/chat/StCompatibilityDialog.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import ModPicker from '@/components/mods/ModPicker.vue'
import { analyzeCharacterRuntime } from '@/lib/characterRuntime'
import { launchStCompatibility } from '@/lib/stCompatibility'

const route = useRoute()
const router = useRouter()
const chars = useCharactersStore()
const ui = useUiStore()
const mods = useModsStore()

const avatar = computed(() => decodeURIComponent((route.params.avatar as string) || ''))
const character = ref<Character | null>(null)
const storiesStore = useStoriesStore()
const stories = computed(() => storiesStore.stories.filter(story => story.characterAvatar === avatar.value))
const chatList = ref<ChatEntry[]>([])
const startModIds = ref<string[]>([])
const loading = ref(false)
const startingWithMods = ref(false)
const startDialogOpen = ref(false)
const savingGreetingIndex = ref<number | null>(null)
const compatDialogOpen = ref(false)
const compatLaunching = ref(false)
const pendingCompatChat = ref('')

const runtimeAnalysis = computed(() => (
  character.value ? analyzeCharacterRuntime(character.value) : null
))

const tags = computed(() => {
  return character.value?.tags?.length
    ? character.value.tags
    : character.value?.data?.tags || []
})

const greetings = computed(() => {
  return characterGreetings(character.value)
})

async function loadData() {
  loading.value = true
  try {
    await mods.load()
    character.value = await fetchCharacter(avatar.value)
    const [, chatResult] = await Promise.all([
      storiesStore.load(),
      fetchCharacterChats(avatar.value),
    ])
    chatList.value = chatResult
  } catch (e: unknown) {
    ui.addToast(`加载失败：${getApiErrorMessage(e)}`, 'error')
    router.push('/characters')
  } finally {
    loading.value = false
  }
}

function openChat(file?: string) {
  if (!character.value) return
  if (runtimeAnalysis.value?.requiresCompatibility) {
    pendingCompatChat.value = file?.replace(/\.jsonl$/i, '') || ''
    compatDialogOpen.value = true
    return
  }
  const query = file ? { chat: file.replace(/\.jsonl$/i, '') } : undefined
  router.push({
    path: `/chat/${encodeURIComponent(character.value.avatar)}`,
    query,
  })
}

function getChatTitle(entry: ChatEntry): string {
  return entry.file_id || stripJsonlName(entry.file_name)
}

async function toggleFavorite() {
  if (!character.value) return
  await chars.toggleFav(character.value)
  character.value = { ...character.value, fav: chars.findCharacter(avatar.value)?.fav || character.value.fav }
}

function openStoryDetail(story: StoryCard) {
  router.push(`/story/${encodeURIComponent(story.id)}`)
}

async function startStory(story: StoryCard) {
  if (!character.value) return
  try {
    const fileName = await createChatFromStory(story, character.value)
    ui.addToast('已创建新的聊天存档', 'success')
    router.push({
      path: `/chat/${encodeURIComponent(character.value.avatar)}`,
      query: { chat: fileName },
    })
  } catch (e: unknown) {
    ui.addToast(`开始故事失败：${getApiErrorMessage(e)}`, 'error')
  }
}

function startCharacterWithMods() {
  if (runtimeAnalysis.value?.requiresCompatibility) {
    pendingCompatChat.value = ''
    compatDialogOpen.value = true
    return
  }
  startDialogOpen.value = true
}

async function confirmCompatibilityLaunch() {
  if (!character.value || compatLaunching.value) return
  compatLaunching.value = true
  try {
    await launchStCompatibility(character.value, {
      chat: pendingCompatChat.value || undefined,
    })
  } catch (e: unknown) {
    compatLaunching.value = false
    ui.addToast(`进入兼容模式失败：${getApiErrorMessage(e)}`, 'error')
  }
}

async function confirmCharacterStart(selection: CharacterStartSelection) {
  if (!character.value || startingWithMods.value) return
  startingWithMods.value = true
  try {
    const fileName = await createChatFromCharacter(character.value, {
      modIds: startModIds.value,
      greeting: selection.greeting,
      greetingIndex: selection.greetingIndex,
      persona: selection.persona,
    })
    startDialogOpen.value = false
    ui.addToast(startModIds.value.length ? '已创建带 MOD 的新聊天' : '已创建新聊天', 'success')
    router.push({
      path: `/chat/${encodeURIComponent(character.value.avatar)}`,
      query: { chat: fileName },
    })
  } catch (e: unknown) {
    ui.addToast(`创建聊天失败：${getApiErrorMessage(e)}`, 'error')
  } finally {
    startingWithMods.value = false
  }
}

async function saveGreetingAsStory(greeting: string, index: number) {
  if (!character.value) return
  savingGreetingIndex.value = index
  try {
    const story = await saveStoryFromCharacterGreeting(character.value, greeting, index)
    storiesStore.invalidate()
    void storiesStore.load(true)
    ui.addToast('已从开场白生成故事卡', 'success')
    router.push(`/story/${encodeURIComponent(story.id)}`)
  } catch (e: unknown) {
    ui.addToast(`生成故事卡失败：${getApiErrorMessage(e)}`, 'error')
  } finally {
    savingGreetingIndex.value = null
  }
}

async function exportCard(format: 'png' | 'json') {
  if (!character.value) return
  try {
    const blob = await exportCharacter(character.value.avatar, format)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = character.value.avatar.replace(/\.png$/i, `.${format}`)
    link.click()
    URL.revokeObjectURL(url)
  } catch (e: unknown) {
    ui.addToast(`导出失败：${getApiErrorMessage(e)}`, 'error')
  }
}

async function removeCharacter() {
  if (!character.value) return
  if (!await confirmDialog({ title: '删除角色', message: `删除「${character.value.name}」及其所有聊天记录？此操作不可撤销。`, danger: true, confirmText: '删除' })) return
  try {
    await deleteCharacter(character.value.avatar)
    await chars.load()
    router.push('/characters')
  } catch (e: unknown) {
    ui.addToast(`删除失败：${getApiErrorMessage(e)}`, 'error')
  }
}

async function duplicateCharacter() {
  if (!character.value) return
  const newName = await promptDialog({ title: '副本角色名', defaultValue: `${character.value.name} 副本` })
  if (!newName?.trim()) return
  try {
    const trimmed = newName.trim()
    const next = {
      ch_name: trimmed,
      description: character.value.description || character.value.data?.description || '',
      personality: character.value.personality || character.value.data?.personality || '',
      scenario: character.value.scenario || character.value.data?.scenario || '',
      first_mes: character.value.data?.first_mes || '',
      mes_example: character.value.mes_example || character.value.data?.mes_example || '',
      creator_notes: character.value.data?.creator_notes || '',
      tags: (character.value.tags || character.value.data?.tags || []).join(', '),
      creator: character.value.data?.creator || '',
      character_version: character.value.data?.character_version || '',
      system_prompt: character.value.data?.system_prompt || '',
      post_history_instructions: character.value.data?.post_history_instructions || '',
      alternate_greetings: (character.value.data?.alternate_greetings || []).join('\n'),
      world: character.value.data?.world || '',
      json_data: character.value.json_data,
    }
    const { createCharacter } = await import('@/api/characters')
    const result = await createCharacter(next)
    ui.addToast('已创建副本', 'success')
    await chars.load()
    if (typeof result === 'string') {
      router.push(`/character/${encodeURIComponent(result)}`)
    }
  } catch (e: unknown) {
    ui.addToast(`复制失败：${getApiErrorMessage(e)}`, 'error')
  }
}

async function quickTagEdit() {
  if (!character.value) return
  const current = (character.value.tags || character.value.data?.tags || []).join(', ')
  const next = await promptDialog({ title: '编辑标签 (逗号分隔)', defaultValue: current })
  if (next === null) return
  const arr = parseTags(next)
  try {
    await mergeAttributes(character.value.avatar, { tags: arr, data: { tags: arr } })
    ui.addToast('标签已更新', 'success')
    await loadData()
    await chars.load()
  } catch (e: unknown) {
    ui.addToast(`保存失败：${getApiErrorMessage(e)}`, 'error')
  }
}

onMounted(loadData)
</script>

<template>
  <div class="min-h-[100dvh] bg-bg">
    <AppPageHeader title="角色详情" back-to="/browse" width="4xl" />

    <div v-if="loading" class="flex justify-center py-16">
      <AppSpinner size="lg" />
    </div>

    <main v-else-if="character" class="mx-auto max-w-4xl space-y-6 px-5 py-6 animate-fade-in-up md:px-8 lg:px-10">
      <!-- 详情页统一 hero：3:4 封面 + 右侧信息，与故事/社区页一致 -->
      <section class="relative overflow-hidden rounded-2xl ring-1 ring-border-subtle bg-hero-radial">
        <div
          v-if="character.avatar && character.avatar !== 'none'"
          class="absolute inset-0 bg-cover bg-center opacity-20 blur-2xl pointer-events-none"
          :style="{ backgroundImage: `url(/characters/${encodeURIComponent(character.avatar)})` }"
        />
        <div class="absolute -top-16 -right-12 w-72 h-72 rounded-full bg-brand-500/25 blur-3xl pointer-events-none" />
        <div class="absolute -bottom-20 -left-8 w-72 h-72 rounded-full bg-accent-500/20 blur-3xl pointer-events-none" />
        <div class="relative flex flex-wrap items-start gap-6 p-5 md:p-7">
          <div class="relative shrink-0">
            <img
              v-if="character.avatar && character.avatar !== 'none'"
              :src="`/characters/${encodeURIComponent(character.avatar)}`"
              class="aspect-[3/4] w-40 rounded-2xl object-cover ring-2 ring-brand-500/40 shadow-glow"
            />
            <div
              v-else
              class="flex aspect-[3/4] w-40 items-center justify-center rounded-2xl bg-brand-soft text-brand-300 ring-2 ring-brand-500/40 shadow-glow"
            >
              <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <button
              class="absolute -top-1 -right-1 w-9 h-9 rounded-full bg-surface-elevated ring-1 ring-border flex items-center justify-center transition-colors"
              :class="character.fav === 'true' ? 'text-accent-400 hover:text-accent-300' : 'text-ink-muted hover:text-ink-secondary'"
              :title="character.fav === 'true' ? '取消收藏' : '加入收藏'"
              @click="toggleFavorite"
            >
              <span class="text-base">{{ character.fav === 'true' ? '★' : '☆' }}</span>
            </button>
          </div>
          <div class="min-w-0 flex-1 space-y-2.5">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-2xl md:text-3xl font-semibold text-ink-primary truncate">{{ character.name }}</h1>
              <span v-if="character.data?.character_version" class="text-[11px] text-ink-muted bg-surface/70 backdrop-blur ring-1 ring-border-subtle px-1.5 py-0.5 rounded">
                v{{ character.data.character_version }}
              </span>
              <span
                v-if="runtimeAnalysis?.requiresCompatibility"
                class="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-500/25"
              >ST 兼容卡</span>
            </div>
            <div class="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
              <span v-if="character.data?.creator">作者 · {{ character.data.creator }}</span>
              <span>{{ chatList.length }} 段聊天</span>
              <span>{{ stories.length }} 张故事卡</span>
            </div>
            <p class="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap line-clamp-5 max-w-2xl">
              {{ character.description || character.data?.description || '(没有描述)' }}
            </p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="tag in tags"
                :key="tag"
                class="text-[11px] px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 transition-colors ring-1 ring-brand-500/20"
                @click="router.push({ path: '/browse', query: { q: tag } })"
              >{{ tag }}</button>
              <button class="text-[11px] px-2 py-0.5 rounded-full ring-1 ring-border-subtle text-ink-secondary hover:text-ink-primary" @click="quickTagEdit">
                {{ tags.length ? '+ 编辑' : '+ 添加标签' }}
              </button>
            </div>
            <div class="flex flex-wrap gap-2 pt-1">
              <AppButton variant="gradient" size="md" @click="startCharacterWithMods">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {{ runtimeAnalysis?.requiresCompatibility ? '进入兼容模式' : '开始对话' }}
              </AppButton>
              <AppButton variant="secondary" @click="router.push(`/character/${encodeURIComponent(character.avatar)}/edit`)">编辑角色</AppButton>
              <AppButton variant="secondary" @click="router.push({ path: '/story/new', query: { avatar: character.avatar } })">新建故事</AppButton>
              <AppButton variant="secondary" @click="router.push({ path: '/publish', query: { type: 'character', sourceId: character.avatar } })">发布作品</AppButton>
            </div>
          </div>
        </div>
      </section>

      <div class="grid md:grid-cols-2 gap-4">
        <AppCard padding="md">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary mb-3">
            <span class="w-1 h-4 rounded-full bg-brand-gradient" />
            性格
          </h3>
          <p class="text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed">
            {{ character.data?.personality || character.personality || '(未填写)' }}
          </p>
        </AppCard>
        <AppCard padding="md">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary mb-3">
            <span class="w-1 h-4 rounded-full bg-brand-gradient" />
            场景
          </h3>
          <p class="text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed">
            {{ character.data?.scenario || character.scenario || '(未填写)' }}
          </p>
        </AppCard>
      </div>

      <AppCard v-if="greetings.length" padding="md">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary mb-3">
          <span class="w-1 h-4 rounded-full bg-brand-gradient" />
          开场白 <span class="text-ink-muted font-normal">({{ greetings.length }})</span>
        </h3>
        <div class="space-y-3">
          <div
            v-for="(g, i) in greetings"
            :key="i"
            class="text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed bg-surface-sunken p-3 rounded-md ring-1 ring-border-subtle"
          >
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span class="text-[11px] text-brand-300 bg-brand-500/10 ring-1 ring-brand-500/20 px-1.5 py-0.5 rounded">#{{ i + 1 }}</span>
              <AppButton
                size="sm"
                variant="secondary"
                :disabled="savingGreetingIndex === i"
                @click="saveGreetingAsStory(g, i)"
              >
                {{ savingGreetingIndex === i ? '保存中…' : '存为故事' }}
              </AppButton>
            </div>
            {{ g }}
          </div>
        </div>
      </AppCard>

      <AppCard padding="md">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <span class="w-1 h-4 rounded-full bg-brand-gradient" />
              开始互动
            </h3>
            <p class="mt-1 text-xs text-ink-muted">可先选择本次聊天要加载的 MOD。创建后选择会写入该聊天存档,不影响其他聊天。</p>
          </div>
          <AppButton size="sm" variant="gradient" :disabled="startingWithMods" @click="startCharacterWithMods">
            {{ startingWithMods ? '创建中…' : startModIds.length ? '带 MOD 开始' : '新聊天' }}
          </AppButton>
        </div>
        <ModPicker
          v-model="startModIds"
          :mods="mods.mods"
          title="本次加载 MOD"
          compact
        />
      </AppCard>

      <AppCard padding="md">
        <div class="flex items-center justify-between mb-3">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
            <span class="w-1 h-4 rounded-full bg-brand-gradient" />
            聊天记录 <span class="text-ink-muted font-normal">({{ chatList.length }})</span>
          </h3>
        </div>
        <AppEmpty
          v-if="!chatList.length"
          icon="chat"
          title="还没有聊天记录"
          description="聊天记录会保存在 ST 本地服务器,开始对话后会出现在这里。"
        />
        <!-- 固定列宽的网格：条数 / 时间 / 操作在所有行上对齐，窄屏再堆叠 -->
        <div v-else class="space-y-2">
          <div
            v-for="entry in chatList"
            :key="entry.file_name"
            class="grid grid-cols-1 items-center gap-x-3 gap-y-1.5 rounded-lg bg-surface-sunken px-3 py-2.5 ring-1 ring-border-subtle transition-colors hover:ring-brand-500/30 sm:grid-cols-[1fr_auto_auto_auto]"
          >
            <div class="min-w-0">
              <button
                class="block w-full truncate text-left text-sm font-medium text-ink-primary transition-colors hover:text-brand-400"
                @click="openChat(entry.file_name)"
              >{{ getChatTitle(entry) }}</button>
              <p class="mt-0.5 text-xs text-ink-muted line-clamp-1">{{ entry.mes || '(暂无消息)' }}</p>
            </div>
            <span class="text-[11px] tabular-nums text-ink-muted sm:text-right">{{ entry.chat_items || 0 }} 条</span>
            <span class="text-[11px] tabular-nums text-ink-muted sm:text-right">{{ formatDateTime(entry.last_mes) }}</span>
            <button class="justify-self-start text-xs text-brand-300 hover:text-brand-200 sm:justify-self-end" @click="openChat(entry.file_name)">继续</button>
          </div>
        </div>
      </AppCard>

      <AppCard padding="md">
        <div class="flex items-center justify-between mb-3">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
            <span class="w-1 h-4 rounded-full bg-brand-gradient" />
            关联故事卡 <span class="text-ink-muted font-normal">({{ stories.length }})</span>
          </h3>
          <AppButton size="sm" variant="secondary" @click="router.push({ path: '/story/new', query: { avatar: character.avatar } })">
            + 新故事
          </AppButton>
        </div>
        <AppEmpty
          v-if="!stories.length"
          icon="chat"
          title="还没有故事"
          description="点击右上角创建一段新故事。"
        />
        <div v-else class="space-y-2">
          <div
            v-for="entry in stories"
            :key="entry.id"
            class="grid grid-cols-1 items-center gap-x-3 gap-y-1.5 rounded-lg bg-surface-sunken px-3 py-2.5 ring-1 ring-border-subtle transition-colors hover:ring-brand-500/30 sm:grid-cols-[1fr_auto_auto]"
          >
            <div class="min-w-0">
              <button
                class="block w-full truncate text-left text-sm font-medium text-ink-primary transition-colors hover:text-brand-400"
                @click="openStoryDetail(entry)"
              >{{ entry.title }}</button>
              <p class="mt-0.5 text-xs text-ink-muted line-clamp-1">{{ entry.summary || entry.scenario || '(无简介)' }}</p>
            </div>
            <span class="truncate text-[11px] text-ink-muted sm:text-right">{{ entry.world ? `世界书 ${entry.world}` : '' }}</span>
            <button class="justify-self-start text-xs text-brand-300 hover:text-brand-200 sm:justify-self-end" @click="startStory(entry)">开始</button>
          </div>
        </div>
      </AppCard>

      <AppCard padding="md">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary mb-3">
          <span class="w-1 h-4 rounded-full bg-brand-gradient" />
          管理
        </h3>
        <div class="flex flex-wrap gap-2">
          <AppButton size="sm" variant="secondary" @click="exportCard('png')">导出 PNG</AppButton>
          <AppButton size="sm" variant="secondary" @click="exportCard('json')">导出 JSON</AppButton>
          <AppButton size="sm" variant="secondary" @click="duplicateCharacter">复制副本</AppButton>
          <AppButton size="sm" variant="danger" @click="removeCharacter">删除角色</AppButton>
        </div>
      </AppCard>

      <CharacterStartDialog
        v-model="startDialogOpen"
        :character="character"
        :busy="startingWithMods"
        @start="confirmCharacterStart"
      />
      <StCompatibilityDialog
        v-model="compatDialogOpen"
        :character="character"
        :analysis="runtimeAnalysis"
        :busy="compatLaunching"
        @confirm="confirmCompatibilityLaunch"
      />
    </main>
  </div>
</template>
