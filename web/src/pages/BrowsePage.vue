<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import type { Character, ChatEntry, ModelProfile, StoryCard } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppDrawer from '@/components/ui/AppDrawer.vue'
import { fetchRecentChats } from '@/api/chats'
import { listStories } from '@/api/stories'
import { stripJsonlName } from '@/lib/format'
import { createChatFromCharacter } from '@/lib/storyStart'
import { getProviderLabel } from '@/lib/providers'

type BrowseTab = 'characters' | 'stories' | 'chats'

const router = useRouter()
const route = useRoute()
const store = useCharactersStore()
const ui = useUiStore()
const models = useModelProfilesStore()

const stories = ref<StoryCard[]>([])
const chatEntries = ref<ChatEntry[]>([])

function normalizeTab(value: unknown): BrowseTab {
  return value === 'stories' || value === 'chats' ? value : 'characters'
}

const activeTab = ref<BrowseTab>(normalizeTab(route.query.tab))
const charFilter = ref<'all' | 'recent' | 'favorites' | 'withChat'>('all')
const noImage = ref(false)
const startingNewChat = ref(false)
const modelPickerOpen = ref(false)

watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab } })
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
})

function goTab(tab: BrowseTab) {
  activeTab.value = tab
}

function focusTab(tab: BrowseTab) {
  activeTab.value = tab
  if (typeof window === 'undefined') return
  window.setTimeout(() => {
    document.getElementById('browse-results')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }, 0)
}

const tabs = computed(() => [
  { key: 'characters' as const, label: '选角色', badge: store.characters.length },
  { key: 'stories' as const, label: '故事开局', badge: stories.value.length || undefined },
  { key: 'chats' as const, label: '继续聊天', badge: chatEntries.value.length || undefined },
])

function toTimestamp(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return new Date(value).getTime()
  return NaN
}

function formatDate(value?: unknown): string {
  if (!value) return '未更新'
  const date = new Date(value as string | number)
  if (Number.isNaN(date.getTime())) return '未更新'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatRelative(value?: unknown): string {
  const t = toTimestamp(value)
  if (!Number.isFinite(t)) return '未更新'
  const diff = Date.now() - t
  if (diff < 0) return formatDate(value)
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return formatDate(value)
}

const continueChats = computed(() =>
  [...chatEntries.value]
    .sort((a, b) => toTimestamp(b.last_mes) - toTimestamp(a.last_mes))
    .slice(0, 6),
)

function isProfileUsable(profile: ModelProfile): boolean {
  if (!profile.model) return false
  if (profile.source === 'custom') return Boolean(profile.endpoint)
  return models.hasSavedApiKey(profile)
}

const usableModelProfiles = computed(() => models.profiles.filter(isProfileUsable))

const hasUsableModel = computed(() => usableModelProfiles.value.length > 0)

const activeModelTitle = computed(() =>
  models.activeProfile.model || models.activeProfile.name || '选择模型',
)

const activeModelSubtitle = computed(() =>
  `${getProviderLabel(models.activeProfile.source)} · ${isProfileUsable(models.activeProfile) ? '可用' : '待配置'}`,
)

const activeTabMeta = computed(() => {
  if (activeTab.value === 'stories') {
    return {
      title: '故事开局',
      status: stories.value.length ? `${stories.value.length} 个故事卡` : '还没有故事卡',
      actionLabel: '去创作',
      action: () => router.push('/create?kind=story'),
    }
  }
  if (activeTab.value === 'chats') {
    return {
      title: '继续聊天',
      status: sortedChats.value.length ? `${sortedChats.value.length} 条聊天记录` : '还没有聊天记录',
      actionLabel: '随机新聊天',
      action: startNewChat,
    }
  }
  return {
    title: '选角色',
    status: store.characters.length ? `${store.characters.length} 个角色` : '还没有角色',
    actionLabel: store.characters.length ? '随机角色' : '去创作',
    action: () => (store.characters.length ? pickRandom() : router.push('/create?kind=character')),
  }
})

const readyStatusText = computed(() => {
  if (!hasUsableModel.value) return '模型未就绪'
  if (!store.characters.length) return '先创建一个角色'
  if (continueChats.value.length) return `最近 ${continueChats.value.length} 条聊天可继续`
  return '可以开始新聊天'
})

function modelStatusLabel(profile: ModelProfile): string {
  if (profile.id === models.activeProfileId) return isProfileUsable(profile) ? '当前' : '需配置'
  return isProfileUsable(profile) ? '可用' : '需配置'
}

function modelStatusClass(profile: ModelProfile): string {
  if (profile.id === models.activeProfileId) {
    return isProfileUsable(profile)
      ? 'bg-brand-500/15 text-brand-200 ring-brand-500/30'
      : 'bg-amber-500/15 text-amber-300 ring-amber-500/30'
  }
  return isProfileUsable(profile)
    ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20'
    : 'bg-amber-500/10 text-amber-300 ring-amber-500/20'
}

function selectDefaultModel(profile: ModelProfile) {
  models.setActive(profile.id)
  modelPickerOpen.value = false
  ui.addToast('默认模型已切换', 'success')
}

function openModelSettings() {
  modelPickerOpen.value = false
  router.push('/settings')
}

const popularTags = computed(() => {
  const counter = new Map<string, number>()
  for (const c of store.characters) {
    const tags = c.tags?.length ? c.tags : c.data?.tags || []
    for (const t of tags) {
      const key = String(t || '').trim()
      if (!key) continue
      counter.set(key, (counter.get(key) || 0) + 1)
    }
  }
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }))
})

function openCharacter(character: Character) {
  router.push(`/chat/${encodeURIComponent(character.avatar)}`)
}

function getChatCharacter(entry: ChatEntry): Character | undefined {
  return entry.avatar ? store.findCharacter(entry.avatar) : undefined
}

function getChatCharacterName(entry: ChatEntry): string {
  return (
    getChatCharacter(entry)?.name ||
    entry.character_name ||
    entry.avatar?.replace(/\.png$/i, '') ||
    '未知角色'
  )
}

function chatThumbnail(entry: ChatEntry): string {
  if (!entry.avatar) return ''
  return `/thumbnail?type=avatar&file=${encodeURIComponent(entry.avatar)}`
}

function getChatTitle(entry: ChatEntry): string {
  return entry.file_id || stripJsonlName(entry.file_name)
}

function openChatEntry(entry: ChatEntry) {
  if (!entry.avatar) {
    ui.addToast('暂不支持从简版 UI 打开群组聊天', 'warning')
    return
  }
  router.push({
    path: `/chat/${encodeURIComponent(entry.avatar)}`,
    query: { chat: stripJsonlName(entry.file_name) },
  })
}

function pickRandom() {
  const pool = store.characters
  if (!pool.length) {
    ui.addToast('还没有角色,先导入或新建一个吧', 'warning')
    return
  }
  openCharacter(pool[Math.floor(Math.random() * pool.length)])
}

async function startNewChat() {
  const pool = store.characters
  if (!pool.length) {
    ui.addToast('先导入或新建一个角色，再开始新聊天', 'warning')
    router.push('/create?kind=character')
    return
  }

  startingNewChat.value = true
  try {
    const character = pool[Math.floor(Math.random() * pool.length)]
    const fileName = await createChatFromCharacter(character)
    ui.addToast(`已为「${character.name}」创建新聊天`, 'success')
    router.push({
      path: `/chat/${encodeURIComponent(character.avatar)}`,
      query: { chat: fileName },
    })
  } catch (e: any) {
    ui.addToast(`创建聊天失败：${e.message}`, 'error')
  } finally {
    startingNewChat.value = false
  }
}

function openTag(tag: string) {
  router.push({ path: '/characters', query: { q: tag } })
}

function getStoryCharacter(story: StoryCard): Character | undefined {
  return store.findCharacter(story.characterAvatar)
}

function storyThumbnail(story: StoryCard): string {
  if (story.coverImage) return story.coverImage
  const character = getStoryCharacter(story)
  if (!character?.avatar || character.avatar === 'none') return ''
  return `/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}`
}

function openStoryDetail(story: StoryCard) {
  router.push(`/story/${encodeURIComponent(story.id)}`)
}

const sortedChats = computed(() =>
  [...chatEntries.value].sort((a, b) => toTimestamp(b.last_mes) - toTimestamp(a.last_mes)),
)

const sortedCharacters = computed(() =>
  [...store.characters].sort((a, b) => {
    const favDiff = (b.fav === 'true' ? 1 : 0) - (a.fav === 'true' ? 1 : 0)
    if (favDiff !== 0) return favDiff
    const ac = Number(a.chat_size) || 0
    const bc = Number(b.chat_size) || 0
    if (ac !== bc) return bc - ac
    return a.name.localeCompare(b.name)
  }),
)

const filteredCharacters = computed(() => {
  let list = sortedCharacters.value
  const now = Date.now()
  const dayMs = 24 * 3600 * 1000
  if (charFilter.value === 'favorites') {
    list = list.filter((c) => c.fav === 'true')
  } else if (charFilter.value === 'withChat') {
    list = list.filter((c) => Number(c.chat_size || 0) > 0)
  } else if (charFilter.value === 'recent') {
    list = list.filter((c) => {
      const t = typeof c.date_last_chat === 'number' ? c.date_last_chat * 1000
        : typeof c.date_last_chat === 'string' ? new Date(c.date_last_chat).getTime()
        : 0
      return t && (now - t) < 7 * dayMs
    })
  }
  return list
})

const charFilters = [
  { key: 'all' as const, label: '全部' },
  { key: 'recent' as const, label: '最近' },
  { key: 'favorites' as const, label: '收藏' },
  { key: 'withChat' as const, label: '有聊天' },
]

function getCharacterTags(c: Character): string[] {
  return c.tags?.length ? c.tags : c.data?.tags || []
}

function getCharacterDescription(c: Character): string {
  return c.description || c.data?.description || ''
}

onMounted(async () => {
  await Promise.all([
    store.characters.length ? Promise.resolve() : store.load(),
    models.loadSecrets().catch(() => undefined),
    listStories()
      .then((res) => (stories.value = res))
      .catch(() => undefined),
    fetchRecentChats(500)
      .then((res) => (chatEntries.value = res))
      .catch(() => undefined),
  ])
})
</script>

<template>
  <div class="min-h-screen bg-bg md:flex">
    <aside class="hidden md:flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-border-subtle bg-surface/70 px-5 py-6 sticky top-0">
      <button class="flex items-center gap-3 text-left" @click="focusTab('characters')">
        <div class="w-11 h-11 rounded-xl bg-brand-gradient flex items-center justify-center text-white text-lg font-bold shadow-glow">
          A
        </div>
        <div class="leading-tight">
          <h1 class="text-xl font-semibold text-ink-primary tracking-tight">AIBAR</h1>
          <p class="text-xs text-ink-muted">选角色，开聊</p>
        </div>
      </button>

      <nav class="mt-10 space-y-1">
        <button
          class="w-full flex items-center justify-between rounded-xl bg-brand-500/15 px-4 py-3 text-left text-sm font-semibold text-brand-200 ring-1 ring-brand-500/35"
          @click="router.push('/browse')"
        >
          <span>探索</span>
        </button>
        <button
          class="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-semibold text-ink-secondary transition-all hover:bg-white/5 hover:text-ink-primary"
          @click="router.push('/create')"
        >
          <span>创作</span>
        </button>
      </nav>

      <nav class="mt-6 space-y-1 border-t border-border-subtle pt-4">
        <button
          v-for="t in tabs"
          :key="t.key"
          :class="[
            'w-full flex items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all',
            activeTab === t.key
              ? 'bg-brand-500/15 text-brand-200 ring-1 ring-brand-500/35'
              : 'text-ink-secondary hover:bg-white/5 hover:text-ink-primary',
          ]"
          @click="focusTab(t.key)"
        >
          <span>{{ t.label }}</span>
          <span v-if="t.badge !== undefined" class="text-xs text-ink-muted">{{ t.badge }}</span>
        </button>
      </nav>

      <div class="mt-auto border-t border-border-subtle pt-4">
        <p class="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">资料库</p>
        <div class="mt-2 space-y-1">
          <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-ink-primary" @click="router.push('/characters')">
            角色库
          </button>
          <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-ink-primary" @click="router.push({ path: '/settings', query: { tab: 'world' } })">
            世界书
          </button>
          <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-ink-primary" @click="router.push({ path: '/settings', query: { tab: 'mods' } })">
            提示词 MOD
          </button>
        </div>

        <p class="mt-4 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">设置</p>
        <div class="mt-2 space-y-1">
          <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-ink-primary" @click="router.push({ path: '/settings', query: { tab: 'model' } })">
            模型连接
          </button>
          <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-ink-primary" @click="router.push({ path: '/settings', query: { tab: 'presets' } })">
            生成参数
          </button>
          <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-ink-primary" @click="router.push({ path: '/settings', query: { tab: 'image' } })">
            图像生成
          </button>
          <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-ink-primary" @click="router.push({ path: '/settings', query: { tab: 'tts' } })">
            语音配置
          </button>
          <button class="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-white/5 hover:text-ink-primary" @click="router.push({ path: '/settings', query: { tab: 'personas' } })">
            我的身份
          </button>
        </div>
      </div>
    </aside>

    <header class="md:hidden border-b border-border-subtle bg-bg/80 backdrop-blur-md sticky top-0 z-20">
      <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <button class="flex items-center gap-3 group" @click="goTab('characters')">
          <div class="w-11 h-11 rounded-xl bg-brand-gradient flex items-center justify-center text-white text-lg font-bold shadow-glow group-hover:shadow-glow-accent transition-shadow">
            A
          </div>
          <div class="text-left leading-tight">
            <h1 class="text-xl font-semibold text-ink-primary tracking-tight">AIBAR</h1>
            <p class="text-xs text-ink-muted">选角色，开聊，少碰配置</p>
          </div>
        </button>

        <nav class="hidden md:flex items-center gap-1.5">
          <button
            v-for="t in tabs"
            :key="t.key"
            :class="[
              'px-5 py-2.5 rounded-xl text-base font-semibold transition-all',
              activeTab === t.key
                ? 'bg-brand-500/20 text-brand-200 ring-1 ring-brand-500/40 shadow-glow'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/5',
            ]"
            @click="goTab(t.key)"
          >
            {{ t.label }}
            <span
              v-if="t.badge !== undefined"
              :class="[
                'ml-1.5 text-sm font-medium',
                activeTab === t.key ? 'text-brand-300' : 'text-ink-muted',
              ]"
            >{{ t.badge }}</span>
          </button>
        </nav>

        <div class="flex items-center gap-1">
          <AppButton variant="ghost" size="md" @click="router.push('/create')">创作</AppButton>
          <AppButton variant="ghost" size="md" @click="router.push('/settings')">设置</AppButton>
        </div>
      </div>

      <nav class="md:hidden border-t border-border-subtle">
        <div class="max-w-7xl mx-auto px-5 py-2 flex items-center gap-1.5 overflow-x-auto">
          <button
            v-for="t in tabs"
            :key="t.key"
            :class="[
              'shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
              activeTab === t.key
                ? 'bg-brand-500/20 text-brand-200 ring-1 ring-brand-500/40'
                : 'text-ink-secondary hover:text-ink-primary',
            ]"
            @click="goTab(t.key)"
          >
            {{ t.label }}
            <span
              v-if="t.badge !== undefined"
              :class="[
                'ml-1 text-xs',
                activeTab === t.key ? 'text-brand-300' : 'text-ink-muted',
              ]"
            >{{ t.badge }}</span>
          </button>
        </div>
      </nav>
    </header>

    <main class="w-full flex-1 px-5 py-5 md:px-8 lg:px-10">
      <div class="mx-auto max-w-6xl space-y-6">
        <header class="sticky top-0 z-20 -mx-5 hidden border-b border-border-subtle bg-bg/90 backdrop-blur md:block md:-mx-8 lg:-mx-10">
          <div class="relative mx-auto flex h-14 max-w-6xl items-center justify-between px-8 lg:px-10">
            <p class="min-w-0 max-w-[32%] truncate text-sm text-ink-muted">{{ readyStatusText }}</p>

            <button
              class="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-ink-primary ring-1 ring-border-subtle shadow-sm transition-all hover:ring-brand-500/40"
              :class="modelPickerOpen ? 'bg-brand-500/10 ring-brand-500/50' : ''"
              @click="modelPickerOpen = true"
            >
              <span class="max-w-[240px] truncate">{{ activeModelTitle }}</span>
              <svg class="h-4 w-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 9l6 6 6-6" />
              </svg>
            </button>

            <button
              class="ml-auto rounded-lg p-2 text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink-primary"
              title="设置"
              @click="router.push('/settings')"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </header>

        <section
          v-if="!hasUsableModel"
          class="flex flex-col gap-3 rounded-lg bg-amber-500/10 p-4 ring-1 ring-amber-400/35 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p class="text-sm font-semibold text-amber-200">模型还没连上</p>
            <p class="mt-1 text-sm text-ink-secondary">先测通一个模型，聊天和 AI 起草才会正常工作。</p>
          </div>
          <AppButton size="sm" variant="secondary" @click="router.push('/settings')">去配置</AppButton>
        </section>

        <div id="browse-results" class="scroll-mt-20 space-y-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div class="min-w-0">
              <h2 class="text-2xl font-semibold tracking-tight text-ink-primary">{{ activeTabMeta.title }}</h2>
              <p class="mt-1 text-sm text-ink-muted">{{ activeTabMeta.status }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <AppButton class="md:hidden" size="md" variant="secondary" @click="modelPickerOpen = true">
                <span class="max-w-[12rem] truncate">{{ activeModelTitle }}</span>
              </AppButton>
              <AppButton
                size="md"
                variant="gradient"
                :disabled="activeTab === 'chats' && startingNewChat"
                @click="activeTabMeta.action"
              >
                {{ activeTab === 'chats' && startingNewChat ? '创建中…' : activeTabMeta.actionLabel }}
              </AppButton>
            </div>
          </div>
      <!-- 角色卡列表 -->
      <section v-if="activeTab === 'characters'">
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <div class="flex items-center gap-1">
            <button
              v-for="f in charFilters"
              :key="f.key"
              :class="[
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                charFilter === f.key
                  ? 'bg-brand-500/20 text-brand-200 ring-1 ring-brand-500/40'
                  : 'text-ink-secondary hover:text-ink-primary hover:bg-white/5',
              ]"
              @click="charFilter = f.key"
            >{{ f.label }}</button>
          </div>
          <div class="flex-1" />
          <label class="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer select-none">
            <input v-model="noImage" type="checkbox" class="accent-brand-500" />
            无图模式
          </label>
        </div>

        <div v-if="popularTags.length && charFilter === 'all'" class="flex flex-wrap gap-2 mb-5">
          <button
            v-for="t in popularTags"
            :key="t.tag"
            class="text-sm px-3.5 py-1.5 rounded-full bg-surface text-ink-secondary ring-1 ring-border-subtle hover:text-ink-primary hover:ring-brand-500/40 transition-all font-medium"
            @click="openTag(t.tag)"
          >
            #{{ t.tag }} <span class="text-ink-muted ml-0.5">{{ t.count }}</span>
          </button>
        </div>

        <div v-if="!store.characters.length" class="rounded-2xl ring-1 ring-border-subtle bg-surface p-12 text-center">
          <p class="text-5xl mb-3">🎭</p>
          <p class="text-lg font-semibold text-ink-primary">还没有角色卡</p>
          <p class="text-sm text-ink-muted mt-2">去创作入口创建角色，或者在角色管理里导入 PNG 角色卡。</p>
          <div class="mt-5 flex justify-center gap-3">
            <AppButton size="md" variant="secondary" @click="router.push('/characters')">导入</AppButton>
            <AppButton size="md" @click="router.push('/create?kind=character')">去创作</AppButton>
          </div>
        </div>
        <div v-else-if="!filteredCharacters.length" class="rounded-2xl ring-1 ring-border-subtle bg-surface p-12 text-center">
          <p class="text-5xl mb-3">🔍</p>
          <p class="text-lg font-semibold text-ink-primary">当前筛选下没有角色</p>
          <p class="text-sm text-ink-muted mt-2">试试切换筛选条件。</p>
          <AppButton size="md" variant="secondary" class="mt-4" @click="charFilter = 'all'">显示全部</AppButton>
        </div>
        <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            v-for="c in filteredCharacters"
            :key="c.avatar"
            class="text-left rounded-2xl ring-1 ring-border-subtle hover:ring-brand-500/40 hover:shadow-glow bg-surface transition-all p-5"
            @click="openCharacter(c)"
          >
            <div class="flex gap-4">
              <img
                v-if="!noImage && c.avatar && c.avatar !== 'none'"
                :src="`/thumbnail?type=avatar&file=${encodeURIComponent(c.avatar)}`"
                class="w-14 h-20 rounded-lg object-cover ring-1 ring-border-subtle shrink-0"
              />
              <div v-else class="w-14 h-20 rounded-lg bg-gradient-to-br from-brand-500/30 to-accent-500/20 ring-1 ring-border-subtle shrink-0 flex items-center justify-center text-2xl">🎭</div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <h4 class="text-base font-semibold text-ink-primary truncate">{{ c.name }}</h4>
                  <span v-if="c.fav === 'true'" class="text-accent-400 text-sm shrink-0">★</span>
                </div>
                <p class="mt-1 text-sm text-ink-muted">{{ c.chat_size ? `${c.chat_size} 条聊天` : '未开始' }}</p>
                <p class="mt-2 min-h-[2.75rem] text-sm text-ink-secondary line-clamp-2 leading-relaxed">
                  {{ getCharacterDescription(c) || '这个角色还没有简介。' }}
                </p>
              </div>
            </div>
            <div v-if="getCharacterTags(c).length" class="mt-3 flex flex-wrap gap-1.5">
              <span
                v-for="tag in getCharacterTags(c).slice(0, 4)"
                :key="tag"
                class="text-xs px-2 py-0.5 rounded bg-brand-500/10 text-brand-300 font-medium"
              >{{ tag }}</span>
            </div>
          </button>
        </div>
      </section>

      <!-- 故事卡列表 -->
      <section v-if="activeTab === 'stories'">
        <div v-if="!stories.length" class="rounded-2xl ring-1 ring-border-subtle bg-surface p-12 text-center">
          <p class="text-5xl mb-3">📖</p>
          <p class="text-lg font-semibold text-ink-primary">还没有故事卡</p>
          <p class="text-sm text-ink-muted mt-2 max-w-md mx-auto">故事卡是可复用开局模板 — 绑定角色、场景、开场消息和默认 MOD。创建后每次都能基于同一设定快速开新存档。</p>
          <div class="mt-5 flex justify-center gap-3">
            <AppButton size="md" @click="router.push('/create?kind=story')">去创作</AppButton>
            <AppButton size="md" variant="secondary" @click="focusTab('characters')">先挑角色</AppButton>
          </div>
        </div>
        <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            v-for="story in stories"
            :key="story.id"
            class="text-left rounded-2xl ring-1 ring-border-subtle hover:ring-brand-500/40 hover:shadow-glow bg-surface transition-all p-5"
            @click="openStoryDetail(story)"
          >
            <div class="flex gap-4">
              <img
                v-if="storyThumbnail(story)"
                :src="storyThumbnail(story)"
                class="w-14 h-20 rounded-lg object-cover ring-1 ring-border-subtle shrink-0"
              />
              <div v-else class="w-14 h-20 rounded-lg bg-gradient-to-br from-brand-500/30 to-accent-500/20 ring-1 ring-border-subtle shrink-0 flex items-center justify-center text-2xl">📖</div>
              <div class="min-w-0 flex-1">
                <h4 class="text-base font-semibold text-ink-primary truncate">{{ story.title }}</h4>
                <p class="mt-1 text-sm text-ink-muted truncate">{{ getStoryCharacter(story)?.name || '角色已缺失' }}</p>
                <p class="mt-2 min-h-[2.75rem] text-sm text-ink-secondary line-clamp-2 leading-relaxed">
                  {{ story.summary || story.scenario || '这个故事卡还没有简介。' }}
                </p>
              </div>
            </div>
            <div v-if="story.tags?.length" class="mt-3 flex flex-wrap gap-1.5">
              <span
                v-for="tag in story.tags.slice(0, 4)"
                :key="tag"
                class="text-xs px-2 py-0.5 rounded bg-brand-500/10 text-brand-300 font-medium"
              >{{ tag }}</span>
            </div>
            <p class="mt-3 text-xs text-ink-muted">{{ formatDate(story.updatedAt || story.createdAt) }}</p>
          </button>
        </div>
      </section>

      <!-- 聊天记录列表 -->
      <section v-if="activeTab === 'chats'">
        <div v-if="!sortedChats.length" class="rounded-2xl ring-1 ring-border-subtle bg-surface p-12 text-center">
          <p class="text-5xl mb-3">💬</p>
          <p class="text-lg font-semibold text-ink-primary">还没有聊天记录</p>
          <p class="text-sm text-ink-muted mt-2">选一张角色卡或故事卡开始第一段对话吧。</p>
        </div>
        <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            v-for="entry in sortedChats"
            :key="entry.avatar ? `${entry.avatar}:${entry.file_name}` : entry.file_name"
            class="text-left rounded-2xl ring-1 ring-border-subtle hover:ring-brand-500/40 hover:shadow-glow bg-surface transition-all p-5"
            @click="openChatEntry(entry)"
          >
            <div class="flex gap-4">
              <img
                v-if="chatThumbnail(entry)"
                :src="chatThumbnail(entry)"
                class="w-14 h-14 rounded-lg object-cover ring-1 ring-border-subtle shrink-0"
              />
              <div v-else class="w-14 h-14 rounded-lg bg-gradient-to-br from-brand-500/30 to-accent-500/20 ring-1 ring-border-subtle shrink-0 flex items-center justify-center text-2xl">💬</div>
              <div class="min-w-0 flex-1">
                <h4 class="text-base font-semibold text-ink-primary truncate">{{ getChatTitle(entry) }}</h4>
                <p class="mt-1 text-sm text-ink-muted truncate">{{ getChatCharacterName(entry) }}</p>
                <p class="mt-2 min-h-[2.75rem] text-sm text-ink-secondary line-clamp-2 leading-relaxed">
                  {{ entry.mes || '这条聊天还没有可预览的最后消息。' }}
                </p>
              </div>
            </div>
            <div class="mt-3 flex items-center justify-between text-xs text-ink-muted">
              <span>{{ entry.chat_items || 0 }} 条 · {{ entry.file_size || '未知大小' }}</span>
              <span>{{ formatRelative(entry.last_mes) }}</span>
            </div>
          </button>
        </div>
      </section>
      </div>
      </div>

      <AppDrawer v-model="modelPickerOpen" title="选择默认模型" width="24rem">
        <div class="space-y-3 p-4">
          <div class="rounded-lg bg-surface-sunken p-4 ring-1 ring-border-subtle">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">当前模型</p>
            <p class="mt-2 truncate text-base font-semibold text-ink-primary">{{ activeModelTitle }}</p>
            <p class="mt-1 text-sm text-ink-muted">{{ activeModelSubtitle }}</p>
          </div>

          <button
            v-for="profile in models.profiles"
            :key="profile.id"
            class="w-full rounded-lg bg-surface p-4 text-left ring-1 ring-border-subtle transition-all hover:ring-brand-500/40"
            :class="profile.id === models.activeProfileId ? 'bg-brand-500/10 ring-brand-500/35' : ''"
            @click="selectDefaultModel(profile)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-ink-primary">{{ profile.name }}</p>
                <p class="mt-1 truncate text-xs text-ink-muted">
                  {{ getProviderLabel(profile.source) }} · {{ profile.model || '未填写模型' }}
                </p>
              </div>
              <span
                class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1"
                :class="modelStatusClass(profile)"
              >
                {{ modelStatusLabel(profile) }}
              </span>
            </div>
          </button>
        </div>

        <template #footer>
          <div class="flex items-center justify-end gap-2">
            <AppButton size="sm" variant="ghost" @click="modelPickerOpen = false">关闭</AppButton>
            <AppButton size="sm" variant="secondary" @click="openModelSettings">管理模型</AppButton>
          </div>
        </template>
      </AppDrawer>
    </main>
  </div>
</template>
