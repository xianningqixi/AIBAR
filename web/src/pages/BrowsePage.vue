<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useSessionStore } from '@/stores/session'
import type { Character, CharacterStartSelection, ChatEntry, ModelProfile, StoryCard } from '@/api/types'
import { useStoriesStore } from '@/stores/stories'
import CharacterStartDialog from '@/components/chat/CharacterStartDialog.vue'
import StCompatibilityDialog from '@/components/chat/StCompatibilityDialog.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppDrawer from '@/components/ui/AppDrawer.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import { getApiErrorMessage } from '@/api/client'
import { fetchRecentChats } from '@/api/chats'
import { formatDateTime, formatRelative, stripJsonlName } from '@/lib/format'
import { characterCover, getCharacterDescription, getCharacterTags, storyThumbnail } from '@/lib/characterMeta'
import { createChatFromCharacter } from '@/lib/storyStart'
import { getProviderLabel } from '@/lib/providers'
import { formatModelPricing } from '@/lib/points'
import { analyzeCharacterRuntime, type CharacterRuntimeAnalysis } from '@/lib/characterRuntime'
import { fetchCharacterForRuntime, launchStCompatibility } from '@/lib/stCompatibility'

type BrowseTab = 'characters' | 'stories' | 'chats'

const router = useRouter()
const route = useRoute()
const store = useCharactersStore()
const ui = useUiStore()
const models = useModelProfilesStore()
const session = useSessionStore()

const storiesStore = useStoriesStore()
const stories = computed(() => storiesStore.stories)
const chatEntries = ref<ChatEntry[]>([])
const loading = ref(true)

function normalizeTab(value: unknown): BrowseTab {
  return value === 'stories' || value === 'chats' ? value : 'characters'
}

const activeTab = ref<BrowseTab>(normalizeTab(route.query.tab))
const charFilter = ref<'all' | 'recent' | 'favorites' | 'withChat'>('all')
const noImage = ref(false)
const startingNewChat = ref(false)
const startDialogOpen = ref(false)
const startCharacter = ref<Character | null>(null)
const modelPickerOpen = ref(false)
const searchQuery = ref('')
const compatDialogOpen = ref(false)
const compatLaunching = ref(false)
const compatCharacter = ref<Character | null>(null)
const compatAnalysis = ref<CharacterRuntimeAnalysis | null>(null)
const pendingCompatChat = ref('')

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

function isProfileUsable(profile: ModelProfile): boolean {
  return Boolean(profile.id && profile.model && profile.enabled !== false)
}

const usableModelProfiles = computed(() => models.profiles.filter(isProfileUsable))

const hasUsableModel = computed(() => usableModelProfiles.value.length > 0)

const activeModelTitle = computed(() =>
  models.activeProfile.model || models.activeProfile.name || '选择模型',
)

const activeModelSubtitle = computed(() =>
  isProfileUsable(models.activeProfile)
    ? formatModelPricing(models.activeProfile)
    : '等待管理员提供共享模型',
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
      : 'bg-amber-500/15 text-amber-600 ring-amber-500/30'
  }
  return isProfileUsable(profile)
    ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20'
    : 'bg-amber-500/10 text-amber-600 ring-amber-500/20'
}

function selectDefaultModel(profile: ModelProfile) {
  if (!isProfileUsable(profile)) return
  models.setActive(profile.id)
  modelPickerOpen.value = false
  ui.addToast('默认模型已切换', 'success')
}

function openModelSettings() {
  modelPickerOpen.value = false
  router.push('/settings')
}

// 角色卡标签多选筛选（“或”关系，与本地控制台一致）
const activeCharTags = ref<string[]>([])

function toggleCharTag(tag: string) {
  activeCharTags.value = activeCharTags.value.includes(tag)
    ? activeCharTags.value.filter(item => item !== tag)
    : [...activeCharTags.value, tag]
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
    .slice(0, 24)
    .map(([tag, count]) => ({ tag, count }))
})

async function resolveRuntime(character: Character, chat = ''): Promise<boolean> {
  const fullCharacter = await fetchCharacterForRuntime(character)
  store.upsertCharacter(fullCharacter)
  const analysis = analyzeCharacterRuntime(fullCharacter)
  if (!analysis.requiresCompatibility) {
    startCharacter.value = fullCharacter
    return false
  }

  compatCharacter.value = fullCharacter
  compatAnalysis.value = analysis
  pendingCompatChat.value = chat.replace(/\.jsonl$/i, '')
  compatDialogOpen.value = true
  return true
}

async function openCharacter(character: Character) {
  try {
    if (await resolveRuntime(character)) return
    startDialogOpen.value = true
  } catch (e: unknown) {
    ui.addToast(`读取角色卡失败：${getApiErrorMessage(e)}`, 'error')
  }
}

async function confirmCompatibilityLaunch() {
  if (!compatCharacter.value || compatLaunching.value) return
  compatLaunching.value = true
  try {
    await launchStCompatibility(compatCharacter.value, {
      chat: pendingCompatChat.value || undefined,
    })
  } catch (e: unknown) {
    compatLaunching.value = false
    ui.addToast(`进入兼容模式失败：${getApiErrorMessage(e)}`, 'error')
  }
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

async function openChatEntry(entry: ChatEntry) {
  if (!entry.avatar) {
    ui.addToast('暂不支持从简版 UI 打开群组聊天', 'warning')
    return
  }
  const entryCharacter = getChatCharacter(entry)
  if (entryCharacter) {
    try {
      if (await resolveRuntime(entryCharacter, entry.file_name)) return
    } catch (e: unknown) {
      ui.addToast(`读取角色卡失败：${getApiErrorMessage(e)}`, 'error')
      return
    }
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
  void openCharacter(pool[Math.floor(Math.random() * pool.length)])
}

function startNewChat() {
  const pool = store.characters
  if (!pool.length) {
    ui.addToast('先导入或新建一个角色，再开始新聊天', 'warning')
    router.push('/create?kind=character')
    return
  }

  void openCharacter(pool[Math.floor(Math.random() * pool.length)])
}

async function confirmCharacterStart(selection: CharacterStartSelection) {
  const character = startCharacter.value
  if (!character || startingNewChat.value) return
  startingNewChat.value = true
  try {
    const fileName = await createChatFromCharacter(character, {
      greeting: selection.greeting,
      greetingIndex: selection.greetingIndex,
      persona: selection.persona,
      profileId: models.activeProfileId,
    })
    startDialogOpen.value = false
    ui.addToast(`已为「${character.name}」创建新聊天`, 'success')
    router.push({
      path: `/chat/${encodeURIComponent(character.avatar)}`,
      query: { chat: fileName },
    })
  } catch (e: unknown) {
    ui.addToast(`创建聊天失败：${getApiErrorMessage(e)}`, 'error')
  } finally {
    startingNewChat.value = false
  }
}

function getStoryCharacter(story: StoryCard): Character | undefined {
  return store.findCharacter(story.characterAvatar)
}

function storyCover(story: StoryCard): string {
  return storyThumbnail(story, getStoryCharacter(story))
}

function openStoryDetail(story: StoryCard) {
  router.push(`/story/${encodeURIComponent(story.id)}`)
}

const sortedChats = computed(() =>
  [...chatEntries.value].sort((a, b) => toTimestamp(b.last_mes) - toTimestamp(a.last_mes)),
)

const recentChats = computed(() => sortedChats.value.slice(0, 12))

// 用 string 而非字面量联合：AppSelect 的 v-model 只回传 string
const charSort = ref<string>('smart')
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
  if (activeCharTags.value.length) {
    const wanted = new Set(activeCharTags.value)
    list = list.filter((c) => getCharacterTags(c).some((tag) => wanted.has(String(tag))))
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

async function loadBrowseData() {
  loading.value = true
  try {
    await Promise.all([
      store.characters.length ? Promise.resolve() : store.load(),
      models.loadSecrets().catch(() => undefined),
      storiesStore.load().catch(() => undefined),
      fetchRecentChats(500)
        .then((res) => (chatEntries.value = res))
        .catch(() => undefined),
    ])
  } finally {
    loading.value = false
  }
}

onMounted(loadBrowseData)
</script>

<template>
  <div class="min-h-[100dvh] bg-bg">
    <header class="md:hidden border-b border-border-subtle bg-bg/80 backdrop-blur-md sticky top-0 z-20">
      <div class="mx-auto flex max-w-6xl items-center px-5 py-4">
        <button class="flex items-center gap-3 group" @click="goTab('characters')">
          <div class="w-11 h-11 rounded-xl bg-brand-gradient flex items-center justify-center text-white text-lg font-bold shadow-glow group-hover:shadow-glow-accent transition-shadow">
            A
          </div>
          <div class="text-left leading-tight">
            <h1 class="text-xl font-semibold text-ink-primary">AIBAR</h1>
            <p class="text-xs text-ink-muted">选角色，开聊，少碰配置</p>
          </div>
        </button>
      </div>

      <nav class="md:hidden border-t border-border-subtle">
        <div class="mx-auto flex max-w-6xl items-center gap-1.5 overflow-x-auto px-5 py-2">
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

    <main class="w-full flex-1">
      <!-- 桌面端置顶工具栏：与下方内容共用同一容器宽度，保证左右边缘对齐 -->
      <header class="sticky top-0 z-20 hidden border-b border-border-subtle bg-bg/90 backdrop-blur md:block">
        <div class="px-5 md:px-8 lg:px-10">
          <div class="mx-auto flex h-16 max-w-6xl items-center gap-3">
            <div class="inline-flex shrink-0 rounded-xl bg-surface p-1 ring-1 ring-border-subtle">
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

            <div class="min-w-0 flex-1">
              <SearchInput v-model="searchQuery" :placeholder="searchPlaceholder" />
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <button
                class="inline-flex max-w-[13rem] items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-medium text-ink-secondary ring-1 ring-border-subtle transition-all hover:text-ink-primary hover:ring-brand-500/40"
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
        </div>
      </header>

      <div class="px-5 py-6 md:px-8 lg:px-10">
        <div class="mx-auto max-w-6xl space-y-6">
        <section
          v-if="!hasUsableModel"
          class="flex flex-col gap-3 rounded-lg bg-amber-500/10 p-4 ring-1 ring-amber-400/35 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p class="text-sm font-semibold text-amber-700">暂无可用模型</p>
            <p class="mt-1 text-sm text-ink-secondary">{{ session.isAdmin ? '请先添加并启用一个共享模型。' : '管理员还没有提供可用的共享模型。' }}</p>
          </div>
          <AppButton v-if="session.isAdmin" size="sm" variant="secondary" @click="router.push({ path: '/settings', query: { tab: 'model' } })">去配置</AppButton>
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

        <!-- min-h 固定结果区高度，加载完成时不再整页跳动 -->
        <div id="browse-results" class="min-h-[60vh] scroll-mt-20 space-y-5">
          <div class="md:hidden">
            <SearchInput v-model="searchQuery" :placeholder="searchPlaceholder" />
          </div>

          <!-- 桌面端的当前分页上下文（移动端由下方的大标题承担） -->
          <div class="hidden items-baseline gap-2 md:flex">
            <h2 class="text-lg font-semibold text-ink-primary">{{ activeTabMeta.title }}</h2>
            <p class="text-sm text-ink-muted">{{ activeTabMeta.status }}</p>
          </div>

          <!-- 移动端：标题 + 模型 + 主操作（桌面端已并入顶部工具栏） -->
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between md:hidden">
            <div class="min-w-0">
              <h2 class="text-2xl font-semibold text-ink-primary">{{ activeTabMeta.title }}</h2>
              <p class="mt-1 text-sm text-ink-muted">{{ activeTabMeta.status }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <AppButton size="md" variant="secondary" @click="modelPickerOpen = true">
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
      <!-- 加载骨架：形状跟随当前分页（聊天是三列列表卡，其余是海报网格） -->
      <div v-if="loading && activeTab === 'chats'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="n in 6" :key="n" class="rounded-2xl bg-surface p-5 ring-1 ring-border-subtle">
          <div class="flex gap-4">
            <div class="skeleton h-14 w-14 shrink-0 rounded-lg" />
            <div class="min-w-0 flex-1 space-y-2">
              <div class="skeleton h-4 w-2/3" />
              <div class="skeleton h-3 w-1/3" />
              <div class="skeleton h-3 w-full" />
            </div>
          </div>
          <div class="skeleton mt-3 h-3 w-1/2" />
        </div>
      </div>
      <div v-else-if="loading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <div v-for="n in 10" :key="n" class="overflow-hidden rounded-2xl bg-surface ring-1 ring-border-subtle">
          <div class="skeleton aspect-[3/4] w-full" />
          <div class="space-y-2 p-3">
            <div class="skeleton h-3 w-3/4" />
            <div class="skeleton h-3 w-1/2" />
          </div>
        </div>
      </div>

      <!-- 角色卡列表 -->
      <section v-if="!loading && activeTab === 'characters'">
        <!-- 筛选行：所有控件统一 38px 高，与 AppSelect 对齐 -->
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <div class="inline-flex h-[38px] items-center rounded-lg bg-surface p-1 ring-1 ring-border-subtle">
            <button
              v-for="f in charFilters"
              :key="f.key"
              :class="[
                'inline-flex h-full items-center rounded-md px-3 text-sm font-medium transition-all',
                charFilter === f.key
                  ? 'bg-brand-500/20 text-brand-200'
                  : 'text-ink-secondary hover:text-ink-primary',
              ]"
              @click="charFilter = f.key"
            >{{ f.label }}</button>
          </div>
          <div class="flex-1" />
          <AppSelect v-model="charSort" class="w-36 shrink-0">
            <option v-for="o in charSortOptions" :key="o.key" :value="o.key">排序 · {{ o.label }}</option>
          </AppSelect>
          <button
            :class="[
              'inline-flex h-[38px] shrink-0 items-center rounded-lg px-3 text-sm font-medium ring-1 transition-all',
              noImage
                ? 'bg-brand-500/20 text-brand-200 ring-brand-500/40'
                : 'text-ink-secondary ring-border-subtle hover:bg-ink-primary/5 hover:text-ink-primary',
            ]"
            @click="noImage = !noImage"
          >无图模式</button>
        </div>

        <!-- 标签单行横滑，避免标签多时把内容推下去 -->
        <div v-if="popularTags.length" class="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="标签筛选">
          <button
            v-if="activeCharTags.length"
            class="shrink-0 text-sm px-3.5 py-1.5 rounded-full bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/40 transition-all font-medium"
            @click="activeCharTags = []"
          >清除筛选</button>
          <button
            v-for="t in popularTags"
            :key="t.tag"
            :class="[
              'shrink-0 text-sm px-3.5 py-1.5 rounded-full ring-1 transition-all font-medium',
              activeCharTags.includes(t.tag)
                ? 'bg-brand-500/10 text-brand-300 ring-brand-500/60'
                : 'bg-surface text-ink-secondary ring-border-subtle hover:text-ink-primary hover:ring-brand-500/40',
            ]"
            :aria-pressed="activeCharTags.includes(t.tag)"
            @click="toggleCharTag(t.tag)"
          >
            #{{ t.tag }} <span class="text-ink-muted ml-0.5">{{ t.count }}</span>
          </button>
        </div>

        <!-- 加载失败与“真的没有角色”是两种状态：失败必须可重试，不能伪装成空库 -->
        <AppEmpty
          v-if="!store.characters.length && store.error"
          icon="box"
          title="角色列表加载失败"
          :description="store.error"
        >
          <template #actions>
            <AppButton size="md" @click="loadBrowseData">重试</AppButton>
          </template>
        </AppEmpty>
        <AppEmpty
          v-else-if="!store.characters.length"
          icon="box"
          title="还没有角色卡"
          description="去创作入口创建角色，或者在角色管理里导入 PNG 角色卡。"
        >
          <template #actions>
            <AppButton size="md" variant="secondary" @click="router.push('/characters')">导入</AppButton>
            <AppButton size="md" @click="router.push('/create?kind=character')">去创作</AppButton>
          </template>
        </AppEmpty>
        <AppEmpty
          v-else-if="!filteredCharacters.length"
          icon="search"
          title="没有匹配的角色"
          :description="searchQuery.trim() ? '换个关键词，或重置筛选。' : '试试切换筛选条件。'"
        >
          <template #actions>
            <AppButton size="md" variant="secondary" @click="charFilter = 'all'; searchQuery = ''; activeCharTags = []">显示全部</AppButton>
          </template>
        </AppEmpty>
        <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <button
            v-for="c in filteredCharacters"
            :key="c.avatar"
            class="group flex h-full flex-col overflow-hidden rounded-2xl bg-surface text-left shadow-sm ring-1 ring-border-subtle transition-all duration-200 hover:-translate-y-1 hover:ring-brand-500/50 hover:shadow-glow"
            @click="openCharacter(c)"
          >
            <div class="relative aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-brand-500/25 to-accent-500/15">
              <img
                v-if="!noImage && c.avatar && c.avatar !== 'none'"
                :src="characterCover(c.avatar)"
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
              <!-- mt-auto：标签行永远贴卡片底部，卡片底边对齐 -->
              <div v-if="getCharacterTags(c).length" class="mt-auto flex flex-wrap gap-1 pt-2">
                <span
                  v-for="tag in getCharacterTags(c).slice(0, 3)"
                  :key="tag"
                  class="rounded bg-brand-500/10 px-1.5 py-0.5 text-[11px] font-medium text-brand-300"
                >{{ tag }}</span>
              </div>
            </div>
          </button>
        </div>
      </section>

      <!-- 故事卡列表 -->
      <section v-if="!loading && activeTab === 'stories'">
        <AppEmpty
          v-if="!stories.length"
          icon="book"
          title="还没有故事卡"
          description="故事卡是可复用开局模板 — 绑定角色、场景、开场消息和默认 MOD。创建后每次都能基于同一设定快速开新存档。"
        >
          <template #actions>
            <AppButton size="md" @click="router.push('/create?kind=story')">去创作</AppButton>
            <AppButton size="md" variant="secondary" @click="focusTab('characters')">先挑角色</AppButton>
          </template>
        </AppEmpty>
        <AppEmpty
          v-else-if="!filteredStories.length"
          icon="search"
          title="没有匹配的故事卡"
          description="换个关键词试试。"
        >
          <template #actions>
            <AppButton size="md" variant="secondary" @click="searchQuery = ''">清除搜索</AppButton>
          </template>
        </AppEmpty>
        <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <button
            v-for="story in filteredStories"
            :key="story.id"
            class="group flex h-full flex-col overflow-hidden rounded-2xl bg-surface text-left shadow-sm ring-1 ring-border-subtle transition-all duration-200 hover:-translate-y-1 hover:ring-brand-500/50 hover:shadow-glow"
            @click="openStoryDetail(story)"
          >
            <div class="relative aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-brand-500/25 to-accent-500/15">
              <img
                v-if="storyCover(story)"
                :src="storyCover(story)"
                loading="lazy"
                decoding="async"
                alt=""
                class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div v-else class="flex h-full w-full items-center justify-center text-5xl">📖</div>
              <div class="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />
              <span class="absolute left-2 top-2 rounded-full bg-brand-gradient px-2 py-0.5 text-[11px] font-medium text-white shadow-glow">故事</span>
              <div class="absolute inset-x-0 bottom-0 p-3">
                <h4 class="truncate text-sm font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">{{ story.title }}</h4>
                <p class="mt-0.5 truncate text-xs text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">{{ getStoryCharacter(story)?.name || '角色已缺失' }}</p>
              </div>
            </div>
            <div class="flex flex-1 flex-col p-3">
              <p class="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-ink-secondary">
                {{ story.summary || story.scenario || '这个故事卡还没有简介。' }}
              </p>
              <!-- mt-auto：标签 + 时间行贴底，卡片底边对齐 -->
              <div class="mt-auto flex items-center justify-between gap-2 pt-2">
                <div v-if="story.tags?.length" class="flex flex-wrap gap-1">
                  <span
                    v-for="tag in story.tags.slice(0, 2)"
                    :key="tag"
                    class="rounded bg-brand-500/10 px-1.5 py-0.5 text-[11px] font-medium text-brand-300"
                  >{{ tag }}</span>
                </div>
                <span class="shrink-0 text-[11px] text-ink-muted">{{ formatDateTime(story.updatedAt || story.createdAt) }}</span>
              </div>
            </div>
          </button>
        </div>
      </section>

      <!-- 聊天记录列表 -->
      <section v-if="!loading && activeTab === 'chats'">
        <AppEmpty
          v-if="!sortedChats.length"
          icon="chat"
          title="还没有聊天记录"
          description="选一张角色卡或故事卡开始第一段对话吧。"
        >
          <template #actions>
            <AppButton size="md" @click="focusTab('characters')">去选角色</AppButton>
          </template>
        </AppEmpty>
        <AppEmpty
          v-else-if="!filteredChats.length"
          icon="search"
          title="没有匹配的聊天"
          description="换个关键词试试。"
        >
          <template #actions>
            <AppButton size="md" variant="secondary" @click="searchQuery = ''">清除搜索</AppButton>
          </template>
        </AppEmpty>
        <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="entry in filteredChats"
            :key="entry.avatar ? `${entry.avatar}:${entry.file_name}` : entry.file_name"
            class="flex h-full flex-col rounded-2xl bg-surface p-5 text-left shadow-sm ring-1 ring-border-subtle transition-all duration-200 hover:-translate-y-0.5 hover:ring-brand-500/40 hover:shadow-glow"
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
            <div class="mt-auto flex items-center justify-between pt-3 text-xs text-ink-muted">
              <span>{{ entry.chat_items || 0 }} 条 · {{ entry.file_size || '未知大小' }}</span>
              <span>{{ formatRelative(entry.last_mes) }}</span>
            </div>
          </button>
        </div>
      </section>
      </div>
      </div>
      </div>

      <AppDrawer v-model="modelPickerOpen" title="选择默认模型" width="24rem">
        <div class="space-y-3 p-4">
          <div class="rounded-lg bg-surface-sunken p-4 ring-1 ring-border-subtle">
            <p class="text-xs font-semibold text-ink-muted">当前模型</p>
            <p class="mt-2 truncate text-base font-semibold text-ink-primary">{{ activeModelTitle }}</p>
            <p class="mt-1 text-sm text-ink-muted">{{ activeModelSubtitle }}</p>
          </div>

          <button
            v-for="profile in usableModelProfiles"
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
                <p class="mt-1 text-xs text-ink-muted">{{ formatModelPricing(profile) }}</p>
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
            <AppButton v-if="session.isAdmin" size="sm" variant="secondary" @click="openModelSettings">管理模型</AppButton>
          </div>
        </template>
      </AppDrawer>
      <CharacterStartDialog
        v-model="startDialogOpen"
        :character="startCharacter"
        :busy="startingNewChat"
        @start="confirmCharacterStart"
      />
      <StCompatibilityDialog
        v-model="compatDialogOpen"
        :character="compatCharacter"
        :analysis="compatAnalysis"
        :busy="compatLaunching"
        @confirm="confirmCompatibilityLaunch"
      />
    </main>
  </div>
</template>
