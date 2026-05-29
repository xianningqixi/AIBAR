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
const loading = ref(true)

function normalizeTab(value: unknown): BrowseTab {
  return value === 'stories' || value === 'chats' ? value : 'characters'
}

const activeTab = ref<BrowseTab>(normalizeTab(route.query.tab))
const charFilter = ref<'all' | 'recent' | 'favorites' | 'withChat'>('all')
const noImage = ref(false)
const startingNewChat = ref(false)
const modelPickerOpen = ref(false)
const searchQuery = ref('')

const searchPlaceholder = computed(() => {
  if (activeTab.value === 'stories') return '搜索故事卡（标题、简介、标签）…'
  if (activeTab.value === 'chats') return '搜索聊天记录…'
  return '搜索角色（名称、简介、标签）…'
})

function includesQuery(fields: Array<string | undefined | null>): boolean {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return true
  return fields.some((f) => (f || '').toLowerCase().includes(q))
}

watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab } })
  searchQuery.value = ''
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

const activeModelReady = computed(() => isProfileUsable(models.activeProfile))

type TabAction = {
  title: string
  status: string
  actionLabel: string
  variant: 'gradient' | 'secondary'
  action: () => void
}

const activeTabMeta = computed<TabAction>(() => {
  if (activeTab.value === 'stories') {
    return {
      title: '故事开局',
      status: stories.value.length ? `${stories.value.length} 个故事卡` : '还没有故事卡',
      actionLabel: '去创作',
      variant: 'gradient',
      action: () => router.push('/create?kind=story'),
    }
  }
  if (activeTab.value === 'chats') {
    return {
      title: '继续聊天',
      status: sortedChats.value.length ? `${sortedChats.value.length} 条聊天记录` : '还没有聊天记录',
      actionLabel: '随机新聊天',
      variant: 'secondary',
      action: startNewChat,
    }
  }
  return {
    title: '选角色',
    status: store.characters.length ? `${store.characters.length} 个角色` : '还没有角色',
    actionLabel: store.characters.length ? '随机角色' : '去创作',
    variant: store.characters.length ? 'secondary' : 'gradient',
    action: () => (store.characters.length ? pickRandom() : router.push('/create?kind=character')),
  }
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

const recentChats = computed(() => sortedChats.value.slice(0, 12))

const charSort = ref<'smart' | 'recent' | 'popular' | 'name'>('smart')
const charSortOptions = [
  { key: 'smart' as const, label: '推荐' },
  { key: 'recent' as const, label: '最近' },
  { key: 'popular' as const, label: '最热' },
  { key: 'name' as const, label: '名称' },
]

function charLastChatMs(c: Character): number {
  const v = c.date_last_chat
  if (typeof v === 'number') return v * 1000
  if (typeof v === 'string') {
    const t = new Date(v).getTime()
    return Number.isFinite(t) ? t : 0
  }
  return 0
}

const sortedCharacters = computed(() => {
  const list = [...store.characters]
  if (charSort.value === 'recent') {
    list.sort((a, b) => charLastChatMs(b) - charLastChatMs(a) || a.name.localeCompare(b.name))
  } else if (charSort.value === 'popular') {
    list.sort((a, b) => (Number(b.chat_size) || 0) - (Number(a.chat_size) || 0) || a.name.localeCompare(b.name))
  } else if (charSort.value === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name))
  } else {
    list.sort((a, b) => {
      const favDiff = (b.fav === 'true' ? 1 : 0) - (a.fav === 'true' ? 1 : 0)
      if (favDiff !== 0) return favDiff
      const ac = Number(a.chat_size) || 0
      const bc = Number(b.chat_size) || 0
      if (ac !== bc) return bc - ac
      return a.name.localeCompare(b.name)
    })
  }
  return list
})

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
  if (searchQuery.value.trim()) {
    list = list.filter((c) =>
      includesQuery([c.name, getCharacterDescription(c), getCharacterTags(c).join(' ')]),
    )
  }
  return list
})

const filteredStories = computed(() => {
  if (!searchQuery.value.trim()) return stories.value
  return stories.value.filter((s) =>
    includesQuery([s.title, s.summary, s.scenario, (s.tags || []).join(' '), getStoryCharacter(s)?.name]),
  )
})

const filteredChats = computed(() => {
  if (!searchQuery.value.trim()) return sortedChats.value
  return sortedChats.value.filter((entry) =>
    includesQuery([getChatTitle(entry), getChatCharacterName(entry), entry.mes]),
  )
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

function cleanDescription(c: Character): string {
  let t = getCharacterDescription(c)
  if (!t) return ''
  t = t.replace(/\{\{char\}\}/gi, c.name).replace(/\{\{user\}\}/gi, '你')
  // 去掉常见的设定包裹符号（方括号、引号、星号、花括号）
  t = t.replace(/[[\]{}"*]/g, ' ')
  // 去掉 SillyTavern 风格的「字段= 值」标签前缀，例如 "Seraphina's Personality= ..."
  t = t.replace(/[A-Za-z][A-Za-z'’ ]*=\s*/g, '')
  // 把因去引号产生的「 , 」碎片收成顿号
  t = t.replace(/\s*,\s*/g, '、')
  // 折叠多余空白与换行
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

onMounted(async () => {
  try {
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
  } finally {
    loading.value = false
  }
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
          <div class="mx-auto flex h-14 max-w-6xl items-center gap-3 px-8 lg:px-10">
            <div class="relative min-w-0 flex-1 max-w-xl">
              <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
              </svg>
              <input
                v-model="searchQuery"
                type="search"
                :placeholder="searchPlaceholder"
                class="w-full rounded-lg bg-surface py-2 pl-9 pr-3 text-sm text-ink-primary ring-1 ring-border-subtle transition-all placeholder:text-ink-muted hover:ring-border-strong focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:shadow-glow"
              />
            </div>

            <div class="ml-auto flex items-center gap-2">
              <button
                class="inline-flex max-w-[14rem] items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-medium text-ink-secondary ring-1 ring-border-subtle transition-all hover:text-ink-primary hover:ring-brand-500/40"
                :class="modelPickerOpen ? 'bg-brand-500/10 text-ink-primary ring-brand-500/50' : ''"
                title="选择默认模型"
                @click="modelPickerOpen = true"
              >
                <span
                  class="h-2 w-2 shrink-0 rounded-full"
                  :class="activeModelReady ? 'bg-emerald-400' : 'bg-amber-400'"
                />
                <span class="truncate">{{ activeModelTitle }}</span>
                <svg class="h-4 w-4 shrink-0 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 9l6 6 6-6" />
                </svg>
              </button>

              <button
                class="shrink-0 rounded-lg p-2 text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink-primary"
                title="设置"
                @click="router.push('/settings')"
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
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

        <section
          v-if="!loading && recentChats.length && activeTab !== 'chats' && !searchQuery.trim()"
          class="space-y-3"
        >
          <div class="flex items-center justify-between">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <span class="h-1.5 w-1.5 rounded-full bg-brand-gradient" />
              最近在聊
            </h3>
            <button class="text-xs text-brand-300 transition-colors hover:text-brand-200" @click="goTab('chats')">
              查看全部
            </button>
          </div>
          <div class="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
            <button
              v-for="entry in recentChats"
              :key="entry.avatar ? `${entry.avatar}:${entry.file_name}` : entry.file_name"
              class="group flex w-60 shrink-0 items-center gap-3 rounded-xl bg-surface p-3 text-left shadow-sm ring-1 ring-border-subtle transition-all duration-200 hover:-translate-y-0.5 hover:ring-brand-500/40 hover:shadow-glow"
              @click="openChatEntry(entry)"
            >
              <img
                v-if="chatThumbnail(entry)"
                :src="chatThumbnail(entry)"
                loading="lazy"
                decoding="async"
                alt=""
                class="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-border-subtle"
              />
              <div v-else class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-xl ring-1 ring-border-subtle">💬</div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-ink-primary">{{ getChatCharacterName(entry) }}</p>
                <p class="truncate text-xs text-ink-muted">{{ entry.mes || '继续上次的对话' }}</p>
                <p class="mt-0.5 text-[11px] text-ink-muted">{{ formatRelative(entry.last_mes) }}</p>
              </div>
            </button>
          </div>
        </section>

        <div id="browse-results" class="scroll-mt-20 space-y-5">
          <div class="hidden md:flex">
            <div class="inline-flex rounded-xl bg-surface p-1 ring-1 ring-border-subtle">
              <button
                v-for="t in tabs"
                :key="t.key"
                :class="[
                  'inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all',
                  activeTab === t.key
                    ? 'bg-brand-gradient text-white shadow-glow'
                    : 'text-ink-secondary hover:text-ink-primary',
                ]"
                @click="goTab(t.key)"
              >
                {{ t.label }}
                <span
                  v-if="t.badge !== undefined"
                  :class="['text-xs', activeTab === t.key ? 'text-white/80' : 'text-ink-muted']"
                >{{ t.badge }}</span>
              </button>
            </div>
          </div>

          <div class="relative md:hidden">
            <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              v-model="searchQuery"
              type="search"
              :placeholder="searchPlaceholder"
              class="w-full rounded-lg bg-surface py-2.5 pl-9 pr-3 text-sm text-ink-primary ring-1 ring-border-subtle transition-all placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>

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
                :variant="activeTabMeta.variant"
                :disabled="activeTab === 'chats' && startingNewChat"
                @click="activeTabMeta.action"
              >
                {{ activeTab === 'chats' && startingNewChat ? '创建中…' : activeTabMeta.actionLabel }}
              </AppButton>
            </div>
          </div>
      <!-- 加载骨架 -->
      <div v-if="loading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <div v-for="n in 8" :key="n" class="overflow-hidden rounded-2xl bg-surface ring-1 ring-border-subtle">
          <div class="skeleton aspect-[3/4] w-full" />
          <div class="space-y-2 p-3">
            <div class="skeleton h-3 w-3/4" />
            <div class="skeleton h-3 w-1/2" />
          </div>
        </div>
      </div>

      <!-- 角色卡列表 -->
      <section v-if="!loading && activeTab === 'characters'">
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
          <select
            v-model="charSort"
            class="rounded-lg bg-surface px-2.5 py-1.5 text-sm text-ink-secondary ring-1 ring-border-subtle transition-colors hover:text-ink-primary focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            title="排序方式"
          >
            <option v-for="o in charSortOptions" :key="o.key" :value="o.key">排序 · {{ o.label }}</option>
          </select>
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
          <p class="text-lg font-semibold text-ink-primary">没有匹配的角色</p>
          <p class="text-sm text-ink-muted mt-2">{{ searchQuery.trim() ? '换个关键词，或重置筛选。' : '试试切换筛选条件。' }}</p>
          <AppButton size="md" variant="secondary" class="mt-4" @click="charFilter = 'all'; searchQuery = ''">显示全部</AppButton>
        </div>
        <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <button
            v-for="c in filteredCharacters"
            :key="c.avatar"
            class="group flex flex-col overflow-hidden rounded-2xl bg-surface text-left shadow-sm ring-1 ring-border-subtle transition-all duration-200 hover:-translate-y-1 hover:ring-brand-500/50 hover:shadow-glow"
            @click="openCharacter(c)"
          >
            <div class="relative aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-brand-500/25 to-accent-500/15">
              <img
                v-if="!noImage && c.avatar && c.avatar !== 'none'"
                :src="`/thumbnail?type=avatar&file=${encodeURIComponent(c.avatar)}`"
                loading="lazy"
                decoding="async"
                alt=""
                class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div v-else class="flex h-full w-full items-center justify-center text-5xl">🎭</div>
              <div class="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />
              <span
                v-if="c.fav === 'true'"
                class="absolute right-2 top-2 rounded-full bg-black/40 px-1.5 py-0.5 text-sm text-accent-300 backdrop-blur-sm"
              >★</span>
              <div class="absolute inset-x-0 bottom-0 p-3">
                <h4 class="truncate text-sm font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">{{ c.name }}</h4>
                <p class="mt-0.5 text-xs text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">{{ c.chat_size ? `${c.chat_size} 条聊天` : '未开始' }}</p>
              </div>
            </div>
            <div class="flex flex-1 flex-col p-3">
              <p class="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-ink-secondary">
                {{ cleanDescription(c) || '这个角色还没有简介。' }}
              </p>
              <div v-if="getCharacterTags(c).length" class="mt-2 flex flex-wrap gap-1">
                <span
                  v-for="tag in getCharacterTags(c).slice(0, 3)"
                  :key="tag"
                  class="rounded bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-300"
                >{{ tag }}</span>
              </div>
            </div>
          </button>
        </div>
      </section>

      <!-- 故事卡列表 -->
      <section v-if="!loading && activeTab === 'stories'">
        <div v-if="!stories.length" class="rounded-2xl ring-1 ring-border-subtle bg-surface p-12 text-center">
          <p class="text-5xl mb-3">📖</p>
          <p class="text-lg font-semibold text-ink-primary">还没有故事卡</p>
          <p class="text-sm text-ink-muted mt-2 max-w-md mx-auto">故事卡是可复用开局模板 — 绑定角色、场景、开场消息和默认 MOD。创建后每次都能基于同一设定快速开新存档。</p>
          <div class="mt-5 flex justify-center gap-3">
            <AppButton size="md" @click="router.push('/create?kind=story')">去创作</AppButton>
            <AppButton size="md" variant="secondary" @click="focusTab('characters')">先挑角色</AppButton>
          </div>
        </div>
        <div v-else-if="!filteredStories.length" class="rounded-2xl ring-1 ring-border-subtle bg-surface p-12 text-center">
          <p class="text-5xl mb-3">🔍</p>
          <p class="text-lg font-semibold text-ink-primary">没有匹配的故事卡</p>
          <p class="text-sm text-ink-muted mt-2">换个关键词试试。</p>
          <AppButton size="md" variant="secondary" class="mt-4" @click="searchQuery = ''">清除搜索</AppButton>
        </div>
        <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <button
            v-for="story in filteredStories"
            :key="story.id"
            class="group flex flex-col overflow-hidden rounded-2xl bg-surface text-left shadow-sm ring-1 ring-border-subtle transition-all duration-200 hover:-translate-y-1 hover:ring-brand-500/50 hover:shadow-glow"
            @click="openStoryDetail(story)"
          >
            <div class="relative aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-brand-500/25 to-accent-500/15">
              <img
                v-if="storyThumbnail(story)"
                :src="storyThumbnail(story)"
                loading="lazy"
                decoding="async"
                alt=""
                class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div v-else class="flex h-full w-full items-center justify-center text-5xl">📖</div>
              <div class="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />
              <span class="absolute left-2 top-2 rounded-full bg-brand-gradient px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white shadow-glow">故事</span>
              <div class="absolute inset-x-0 bottom-0 p-3">
                <h4 class="truncate text-sm font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">{{ story.title }}</h4>
                <p class="mt-0.5 truncate text-xs text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">{{ getStoryCharacter(story)?.name || '角色已缺失' }}</p>
              </div>
            </div>
            <div class="flex flex-1 flex-col p-3">
              <p class="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-ink-secondary">
                {{ story.summary || story.scenario || '这个故事卡还没有简介。' }}
              </p>
              <div class="mt-2 flex items-center justify-between gap-2">
                <div v-if="story.tags?.length" class="flex flex-wrap gap-1">
                  <span
                    v-for="tag in story.tags.slice(0, 2)"
                    :key="tag"
                    class="rounded bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-300"
                  >{{ tag }}</span>
                </div>
                <span class="shrink-0 text-[10px] text-ink-muted">{{ formatDate(story.updatedAt || story.createdAt) }}</span>
              </div>
            </div>
          </button>
        </div>
      </section>

      <!-- 聊天记录列表 -->
      <section v-if="!loading && activeTab === 'chats'">
        <div v-if="!sortedChats.length" class="rounded-2xl ring-1 ring-border-subtle bg-surface p-12 text-center">
          <p class="text-5xl mb-3">💬</p>
          <p class="text-lg font-semibold text-ink-primary">还没有聊天记录</p>
          <p class="text-sm text-ink-muted mt-2">选一张角色卡或故事卡开始第一段对话吧。</p>
        </div>
        <div v-else-if="!filteredChats.length" class="rounded-2xl ring-1 ring-border-subtle bg-surface p-12 text-center">
          <p class="text-5xl mb-3">🔍</p>
          <p class="text-lg font-semibold text-ink-primary">没有匹配的聊天</p>
          <p class="text-sm text-ink-muted mt-2">换个关键词试试。</p>
          <AppButton size="md" variant="secondary" class="mt-4" @click="searchQuery = ''">清除搜索</AppButton>
        </div>
        <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            v-for="entry in filteredChats"
            :key="entry.avatar ? `${entry.avatar}:${entry.file_name}` : entry.file_name"
            class="text-left rounded-2xl shadow-sm ring-1 ring-border-subtle bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:ring-brand-500/40 hover:shadow-glow"
            @click="openChatEntry(entry)"
          >
            <div class="flex gap-4">
              <img
                v-if="chatThumbnail(entry)"
                :src="chatThumbnail(entry)"
                loading="lazy"
                decoding="async"
                alt=""
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
