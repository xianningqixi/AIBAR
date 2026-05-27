<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import type { Character, ChatEntry, StoryCard } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import { fetchRecentChats } from '@/api/chats'
import { listStories } from '@/api/stories'
import { stripJsonlName } from '@/lib/format'

type BrowseTab = 'characters' | 'stories' | 'chats'

const router = useRouter()
const route = useRoute()
const store = useCharactersStore()
const ui = useUiStore()

const stories = ref<StoryCard[]>([])
const chatEntries = ref<ChatEntry[]>([])

function normalizeTab(value: unknown): BrowseTab {
  return value === 'stories' || value === 'chats' ? value : 'characters'
}

const activeTab = ref<BrowseTab>(normalizeTab(route.query.tab))
const charFilter = ref<'all' | 'recent' | 'favorites' | 'withChat'>('all')
const noImage = ref(false)

watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab } })
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
})

function goTab(tab: BrowseTab) {
  activeTab.value = tab
}

const tabs = computed(() => [
  { key: 'characters' as const, label: '角色卡', badge: store.characters.length },
  { key: 'stories' as const, label: '故事卡', badge: stories.value.length || undefined },
  { key: 'chats' as const, label: '聊天记录', badge: chatEntries.value.length || undefined },
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

const stats = computed(() => {
  const list = store.characters
  const now = Date.now()
  const weekMs = 7 * 24 * 3600 * 1000
  return {
    characters: list.length,
    favorites: list.filter((c) => c.fav === 'true').length,
    totalStories: stories.value.length,
    totalChats: chatEntries.value.length,
    recentWeek: chatEntries.value.filter((entry) => {
      const t = toTimestamp(entry.last_mes)
      return Number.isFinite(t) && now - t < weekMs
    }).length,
  }
})

const continueChats = computed(() =>
  [...chatEntries.value]
    .sort((a, b) => toTimestamp(b.last_mes) - toTimestamp(a.last_mes))
    .slice(0, 6),
)

const favCharacters = computed(() =>
  store.characters.filter((c) => c.fav === 'true').slice(0, 12),
)

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

function continueLatest() {
  const top = continueChats.value[0]
  if (top) {
    openChatEntry(top)
    return
  }
  if (store.characters.length) {
    pickRandom()
  } else {
    ui.addToast('还没有任何聊天,导入或新建一个角色开始吧', 'warning')
  }
}

function openTag(tag: string) {
  router.push({ path: '/characters', query: { q: tag } })
}

function getStoryCharacter(story: StoryCard): Character | undefined {
  return store.findCharacter(story.characterAvatar)
}

function storyThumbnail(story: StoryCard): string {
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
  <div class="min-h-screen flex flex-col bg-bg">
    <header class="border-b border-border-subtle bg-bg/80 backdrop-blur-md sticky top-0 z-20">
      <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <button class="flex items-center gap-3 group" @click="goTab('characters')">
          <div class="w-11 h-11 rounded-xl bg-brand-gradient flex items-center justify-center text-white text-lg font-bold shadow-glow group-hover:shadow-glow-accent transition-shadow">
            A
          </div>
          <div class="text-left leading-tight">
            <h1 class="text-xl font-semibold text-ink-primary tracking-tight">AIBAR</h1>
            <p class="text-xs text-ink-muted">SillyTavern 简版</p>
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
          <AppButton variant="ghost" size="md" @click="router.push('/characters')">角色管理</AppButton>
          <AppButton variant="ghost" size="md" @click="router.push('/mods')">MOD</AppButton>
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

    <div class="max-w-7xl mx-auto w-full px-6 py-8 flex-1 space-y-10">
      <!-- HERO -->
      <section class="relative overflow-hidden rounded-3xl ring-1 ring-border bg-surface bg-hero-radial">
        <div class="absolute -top-24 -right-16 w-80 h-80 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />
        <div class="absolute -bottom-24 -left-16 w-80 h-80 rounded-full bg-accent-500/15 blur-3xl pointer-events-none" />

        <div class="relative grid lg:grid-cols-[1.4fr_1fr] gap-8 p-8 md:p-10">
          <div class="space-y-6">
            <div>
              <p class="text-sm uppercase tracking-[0.22em] text-brand-300/90 font-medium">欢迎回来</p>
              <h2 class="mt-3 text-4xl md:text-5xl font-bold text-ink-primary leading-tight">
                和你的角色,继续 <span class="text-brand-300">未完的故事</span>。
              </h2>
              <p class="mt-4 text-base md:text-lg text-ink-secondary max-w-xl leading-relaxed">
                这里集中了你的角色卡、故事开局模板、以及所有聊天记录。挑一个继续,或者从一张新的角色卡开始。
              </p>
            </div>

            <div class="flex flex-wrap gap-3">
              <button
                class="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold bg-brand-gradient text-white shadow-glow hover:shadow-glow-accent transition-shadow"
                @click="continueLatest"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                {{ continueChats.length ? '继续最新聊天' : '随机抽一个开始' }}
              </button>
              <AppButton variant="secondary" size="lg" @click="pickRandom">
                🎲 随机角色
              </AppButton>
              <AppButton variant="secondary" size="lg" @click="router.push('/character/new')">+ 新建角色</AppButton>
              <AppButton variant="secondary" size="lg" @click="router.push('/story/new')">+ 新故事卡</AppButton>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 content-start">
            <button
              class="text-left p-4 rounded-2xl bg-surface-elevated/70 ring-1 ring-border-subtle hover:ring-brand-500/40 hover:bg-surface-elevated transition-all"
              @click="router.push('/characters')"
            >
              <p class="text-xs uppercase tracking-wide text-ink-muted font-medium">角色卡</p>
              <p class="mt-1 text-3xl md:text-4xl font-bold text-ink-primary">{{ stats.characters }}</p>
            </button>
            <button
              class="text-left p-4 rounded-2xl bg-surface-elevated/70 ring-1 ring-border-subtle hover:ring-accent-500/40 hover:bg-surface-elevated transition-all"
              @click="router.push('/characters')"
            >
              <p class="text-xs uppercase tracking-wide text-ink-muted font-medium">收藏</p>
              <p class="mt-1 text-3xl md:text-4xl font-bold text-accent-400">{{ stats.favorites }}</p>
            </button>
            <button
              class="text-left p-4 rounded-2xl bg-surface-elevated/70 ring-1 ring-border-subtle hover:ring-brand-500/40 hover:bg-surface-elevated transition-all"
              @click="router.push('/story/new')"
            >
              <p class="text-xs uppercase tracking-wide text-ink-muted font-medium">故事卡</p>
              <p class="mt-1 text-3xl md:text-4xl font-bold text-brand-300">{{ stats.totalStories }}</p>
            </button>
            <button
              class="text-left p-4 rounded-2xl bg-surface-elevated/70 ring-1 ring-border-subtle hover:ring-brand-500/40 hover:bg-surface-elevated transition-all"
              @click="continueLatest"
            >
              <p class="text-xs uppercase tracking-wide text-ink-muted font-medium">聊天 · 7 天</p>
              <p class="mt-1 text-3xl md:text-4xl font-bold text-ink-primary">
                {{ stats.totalChats }}
                <span class="text-base text-brand-300 ml-1 font-semibold">+{{ stats.recentWeek }}</span>
              </p>
            </button>
          </div>
        </div>
      </section>

      <!-- 角色卡列表 -->
      <section v-if="activeTab === 'characters'">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold text-ink-primary flex items-center gap-3">
            <span class="w-1.5 h-6 rounded-full bg-brand-gradient" />
            角色卡
            <span class="text-base text-ink-muted font-medium">{{ store.characters.length }}</span>
          </h3>
          <div class="flex items-center gap-2">
            <AppButton size="md" variant="ghost" @click="router.push('/characters')">管理</AppButton>
            <AppButton size="md" variant="gradient" @click="router.push('/character/new')">+ 新建角色</AppButton>
          </div>
        </div>

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
          <p class="text-sm text-ink-muted mt-2">导入一张 PNG 角色卡,或者从零开始新建。</p>
          <div class="mt-5 flex justify-center gap-3">
            <AppButton size="md" variant="secondary" @click="router.push('/characters')">导入</AppButton>
            <AppButton size="md" @click="router.push('/character/new')">+ 新建角色</AppButton>
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
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold text-ink-primary flex items-center gap-3">
            <span class="w-1.5 h-6 rounded-full bg-brand-gradient" />
            故事卡
            <span class="text-base text-ink-muted font-medium">{{ stories.length }}</span>
          </h3>
          <AppButton size="md" variant="gradient" @click="router.push('/story/new')">+ 新故事卡</AppButton>
        </div>
        <div v-if="!stories.length" class="rounded-2xl ring-1 ring-border-subtle bg-surface p-12 text-center">
          <p class="text-5xl mb-3">📖</p>
          <p class="text-lg font-semibold text-ink-primary">还没有故事卡</p>
          <p class="text-sm text-ink-muted mt-2 max-w-md mx-auto">故事卡是可复用开局模板 — 绑定角色、场景、开场消息和默认 MOD。创建后每次都能基于同一设定快速开新存档。</p>
          <div class="mt-5 flex justify-center gap-3">
            <AppButton size="md" @click="router.push('/story/new')">+ 创建第一个故事</AppButton>
            <AppButton size="md" variant="secondary" @click="goTab('characters')">先挑角色</AppButton>
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
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold text-ink-primary flex items-center gap-3">
            <span class="w-1.5 h-6 rounded-full bg-brand-gradient" />
            聊天记录
            <span class="text-base text-ink-muted font-medium">{{ sortedChats.length }}</span>
          </h3>
        </div>
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
</template>
