<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import {
  downloadCommunityContent,
  listCommunityWorks,
  publishDiscordCommunityWork,
  type CommunityWork,
  type CommunityWorkType,
  type DiscordCommunitySource,
} from '@/api/community'
import { importCharacter } from '@/api/characters'
import WorkCard from '@/components/community/WorkCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppInput from '@/components/ui/AppInput.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import { getApiErrorMessage } from '@/api/client'

// 筛选栏统一控件尺寸：分段控件与开关胶囊同高
const segmentedClass = 'inline-flex h-9 shrink-0 items-center rounded-lg border border-border bg-surface p-1'
const segmentedItemClass = 'inline-flex h-7 items-center rounded-md px-3 text-xs font-medium transition-colors'
const chipClass = 'inline-flex h-9 shrink-0 items-center rounded-lg border px-3 text-xs font-medium transition-colors'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const ui = useUiStore()

type HubSource = 'community' | 'discord'

const source = ref<HubSource>(route.query.source === 'discord' ? 'discord' : 'community')
const works = ref<CommunityWork[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const search = ref('')
const type = ref<'' | CommunityWorkType>('')
const ranking = ref<'recommended' | 'recent' | 'daily' | 'weekly' | 'monthly' | 'all'>('recommended')
const noImage = ref(false)
const favoritesOnly = ref(false)
const mineOnly = ref(false)
const page = ref(1)
const hasMore = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null
let requestSequence = 0

const importUrl = ref('')
const importing = ref(false)
const importResult = ref('')
const importError = ref('')
const publishedWorkId = ref('')
const publishedStatus = ref<'' | 'published' | 'duplicate'>('')

function routeQueryText(value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : value
  return typeof candidate === 'string' ? candidate.trim() : ''
}

const discordSource = computed<DiscordCommunitySource | null>(() => {
  const guildId = routeQueryText(route.query.discordGuildId)
  const channelId = routeQueryText(route.query.discordChannelId)
  const threadId = routeQueryText(route.query.discordThreadId)
  const cardId = routeQueryText(route.query.discordCardId)
  const sourceUrl = routeQueryText(route.query.discordSourceUrl)
  const title = routeQueryText(route.query.discordTitle)
  const authorName = routeQueryText(route.query.discordAuthorName)
  const rawTags = route.query.discordTag
  const tags = (Array.isArray(rawTags) ? rawTags : [rawTags])
    .filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim()))
    .map(tag => tag.trim())
  if (!guildId || !channelId || !threadId || !cardId || !sourceUrl || !title) return null
  return { guildId, channelId, threadId, cardId, sourceUrl, title, authorName, tags }
})

const rankings = [
  { value: 'recommended', label: '推荐' },
  { value: 'recent', label: '最新' },
  { value: 'daily', label: '日榜' },
  { value: 'weekly', label: '周榜' },
  { value: 'monthly', label: '月榜' },
  { value: 'all', label: '总榜' },
] as const

const typeFilters: { value: '' | CommunityWorkType; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'character', label: '角色' },
  { value: 'story', label: '故事' },
  { value: 'mod', label: '提示词' },
]

async function loadWorks(append = false) {
  const requestId = ++requestSequence
  const requestedPage = append ? page.value + 1 : 1
  if (append) {
    loadingMore.value = true
  } else {
    loading.value = true
    loadingMore.value = false
    works.value = []
    hasMore.value = false
  }
  try {
    const result = await listCommunityWorks({
      search: search.value,
      type: type.value,
      ranking: ranking.value,
      favoritesOnly: favoritesOnly.value,
      mineOnly: mineOnly.value,
      page: requestedPage,
    })
    if (requestId !== requestSequence) return
    if (append) {
      const existingIds = new Set(works.value.map(work => work.id))
      works.value = [...works.value, ...result.works.filter(work => !existingIds.has(work.id))]
    } else {
      works.value = result.works
    }
    page.value = result.page
    hasMore.value = result.hasMore
  } catch (e: unknown) {
    if (requestId === requestSequence) ui.addToast(`加载社区失败：${getApiErrorMessage(e)}`, 'error')
  } finally {
    if (requestId === requestSequence) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

function loadCommunityWorks() {
  if (source.value === 'community') void loadWorks()
}

function loadMoreWorks() {
  if (!loading.value && !loadingMore.value && hasMore.value) void loadWorks(true)
}

function selectSource(next: HubSource) {
  source.value = next
  const query = { ...route.query }
  if (next === 'discord') query.source = 'discord'
  else delete query.source
  void router.replace({ query })
  if (next === 'community' && !works.value.length) void loadWorks()
}

watch(
  () => route.query.source,
  (value) => {
    const next: HubSource = value === 'discord' ? 'discord' : 'community'
    if (source.value === next) return
    source.value = next
    if (next === 'community' && !works.value.length) void loadWorks()
  },
)
watch([type, ranking, favoritesOnly, mineOnly], loadCommunityWorks)
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(loadCommunityWorks, 250)
})

function normalizeDiscordUrl(value: string): string {
  const parsed = new URL(value)
  const validHost = parsed.hostname === 'cdn.discordapp.com' || parsed.hostname === 'media.discordapp.net'
  if (!validHost || !parsed.pathname.includes('/attachments/') || !parsed.pathname.toLowerCase().endsWith('.png')) {
    throw new Error('请使用 Discord 附件中的 PNG 卡体链接')
  }
  parsed.hostname = 'cdn.discordapp.com'
  for (const key of ['format', 'quality', 'width', 'height']) parsed.searchParams.delete(key)
  return parsed.toString()
}

async function importFromDiscord() {
  if (!importUrl.value.trim() || !discordSource.value) return
  const accountHandle = session.user?.handle || ''
  const accountIsCurrent = () => accountHandle && session.user?.handle === accountHandle
  importing.value = true
  importResult.value = ''
  importError.value = ''
  publishedWorkId.value = ''
  publishedStatus.value = ''
  try {
    const content = await downloadCommunityContent(normalizeDiscordUrl(importUrl.value.trim()))
    if (!accountIsCurrent()) return
    if (content.type !== 'character') throw new Error('该 PNG 未被识别为角色卡')
    const file = new File([content.blob], content.fileName || 'discord-character.png', { type: content.mimeType || 'image/png' })
    const imported = await importCharacter(file)
    if (!accountIsCurrent()) return
    const avatar = imported.file_name ? `${imported.file_name}.png` : ''
    if (!avatar) throw new Error('后端未返回角色文件名，无法发布到公共区')
    const publication = await publishDiscordCommunityWork({
      sourceId: avatar,
      source: discordSource.value,
    })
    if (!accountIsCurrent()) return
    publishedWorkId.value = publication.work.id
    publishedStatus.value = publication.status
    importResult.value = publication.status === 'duplicate'
      ? '公共区已存在相同角色卡，已关联现有作品'
      : '角色卡已发布到公共区，所有用户均可使用'
    ui.addToast(importResult.value, 'success')
  } catch (e: unknown) {
    importError.value = `发布失败：${getApiErrorMessage(e)}`
    ui.addToast(importError.value, 'error')
  } finally {
    importing.value = false
  }
}

onMounted(() => {
  if (source.value === 'community') void loadWorks()
})

onBeforeUnmount(() => {
  requestSequence += 1
  if (searchTimer) clearTimeout(searchTimer)
})
</script>

<template>
  <div class="min-h-[100dvh] bg-bg">
    <AppPageHeader
      :title="source === 'discord' ? 'Discord 公共发布' : '社区作品'"
      :subtitle="source === 'discord' ? '发布 Discord 角色卡到公共区' : '角色卡、故事与提示词'"
      :show-back="false"
    >
      <template #actions>
        <AppButton v-if="source === 'community'" size="sm" variant="secondary" @click="router.push('/publish')">发布作品</AppButton>
      </template>
    </AppPageHeader>

    <main class="mx-auto max-w-6xl px-5 py-6 md:px-8 lg:px-10">
      <div class="mb-6 inline-flex w-full rounded-lg border border-border bg-surface p-1 md:w-auto" aria-label="资源来源">
        <button
          class="min-w-0 flex-1 rounded-md px-2 py-2 text-xs font-medium leading-tight md:flex-none md:px-4 md:text-sm"
          :class="source === 'community' ? 'bg-brand-500/10 text-brand-300' : 'text-ink-secondary hover:bg-surface-sunken'"
          :aria-pressed="source === 'community'"
          @click="selectSource('community')"
        ><span class="md:hidden">AIBAR</span><span class="hidden md:inline">AIBAR 社区</span></button>
        <button
          class="min-w-0 flex-1 rounded-md px-2 py-2 text-xs font-medium leading-tight md:flex-none md:px-4 md:text-sm"
          :class="source === 'discord' ? 'bg-brand-500/10 text-brand-300' : 'text-ink-secondary hover:bg-surface-sunken'"
          :aria-pressed="source === 'discord'"
          @click="selectSource('discord')"
        ><span class="md:hidden">Discord 发布</span><span class="hidden md:inline">Discord 公共发布</span></button>
      </div>

      <template v-if="source === 'community'">
        <div class="space-y-6">
          <!-- 筛选栏：搜索 + 分段控件（类型/榜单）+ 开关胶囊，控件统一 h-9 -->
          <div class="flex flex-col gap-3 border-b border-border pb-5">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
              <SearchInput v-model="search" class="min-w-0 flex-1" placeholder="搜索标题、作者或简介" />
              <div class="flex flex-wrap items-center gap-2">
                <div :class="segmentedClass" role="group" aria-label="作品类型">
                  <button v-for="item in typeFilters" :key="item.value" :class="[segmentedItemClass, type === item.value ? 'bg-brand-500/10 text-brand-300' : 'text-ink-secondary hover:bg-surface-sunken']" :aria-pressed="type === item.value" @click="type = item.value">{{ item.label }}</button>
                </div>
                <button :class="[chipClass, favoritesOnly ? 'border-brand-500 bg-brand-500/10 text-brand-300' : 'border-border bg-surface text-ink-secondary hover:bg-surface-sunken']" :aria-pressed="favoritesOnly" @click="favoritesOnly = !favoritesOnly">收藏</button>
                <button :class="[chipClass, mineOnly ? 'border-brand-500 bg-brand-500/10 text-brand-300' : 'border-border bg-surface text-ink-secondary hover:bg-surface-sunken']" :aria-pressed="mineOnly" @click="mineOnly = !mineOnly">我发布的</button>
                <button :class="[chipClass, noImage ? 'border-brand-500 bg-brand-500/10 text-brand-300' : 'border-border bg-surface text-ink-secondary hover:bg-surface-sunken']" :aria-pressed="noImage" @click="noImage = !noImage">无图模式</button>
              </div>
            </div>
            <div class="overflow-x-auto">
              <div :class="segmentedClass" role="group" aria-label="排序榜单">
                <button v-for="item in rankings" :key="item.value" :class="[segmentedItemClass, ranking === item.value ? 'bg-brand-500/10 text-brand-300' : 'text-ink-secondary hover:bg-surface-sunken']" :aria-pressed="ranking === item.value" @click="ranking = item.value">{{ item.label }}</button>
              </div>
            </div>
          </div>

          <div v-if="loading" class="py-20"><AppSpinner size="lg" /></div>
          <AppEmpty v-else-if="!works.length" class="!py-8 md:!py-16" icon="search" title="没有匹配的作品" description="调整筛选条件，或发布第一份公共作品。">
            <template #actions><AppButton @click="router.push('/publish')">发布作品</AppButton></template>
          </AppEmpty>
          <section v-else :class="noImage ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'">
            <button v-for="(work, index) in works" :key="work.id" class="h-full min-w-0 text-left" @click="router.push(`/work/${encodeURIComponent(work.id)}`)">
              <WorkCard :work="work" :no-image="noImage" :eager="index < 5" />
            </button>
          </section>
          <div v-if="hasMore" class="flex justify-center">
            <AppButton variant="secondary" :disabled="loadingMore" @click="loadMoreWorks">{{ loadingMore ? '加载中…' : '加载更多' }}</AppButton>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="max-w-3xl">
          <AppCard padding="lg">
            <div class="space-y-4">
              <div>
                <h2 class="text-base font-semibold text-ink-primary">发布 Discord 角色卡</h2>
                <p class="mt-1 text-sm text-ink-muted">角色卡解析完成后会立即发布为公共作品。</p>
              </div>
              <div v-if="discordSource" class="border-l-2 border-brand-500 pl-3">
                <p class="text-sm font-medium text-ink-primary">{{ discordSource.title }}</p>
                <p class="mt-1 text-xs text-ink-muted">{{ discordSource.authorName || 'Discord 作者' }}</p>
              </div>
              <p v-else class="text-sm text-amber-700" data-testid="discord-publish-context-error">缺少 Discord 帖子来源，请从本地同步控制台选择角色卡并发起发布。</p>
              <div class="flex flex-col gap-3 md:flex-row">
                <AppInput
                  v-model="importUrl"
                  data-testid="discord-png-import-input"
                  type="url"
                  placeholder="cdn.discordapp.com/attachments/.../*.png"
                  class="min-w-0 flex-1"
                  @keydown.enter.prevent="importFromDiscord"
                />
                <AppButton
                  data-testid="discord-png-import-submit"
                  :disabled="importing || !importUrl.trim() || !discordSource"
                  @click="importFromDiscord"
                >{{ importing ? '发布中…' : '发布到公共区' }}</AppButton>
              </div>
              <div v-if="importResult" class="flex flex-wrap items-center gap-3">
                <p
                  data-testid="discord-png-import-result"
                  :data-publish-status="publishedStatus"
                  :data-work-id="publishedWorkId"
                  class="text-sm text-emerald-700"
                >{{ importResult }}</p>
                <AppButton size="sm" variant="secondary" @click="router.push(`/work/${encodeURIComponent(publishedWorkId)}`)">查看公共作品</AppButton>
              </div>
              <p v-if="importError" data-testid="discord-png-import-error" class="text-sm text-red-700">{{ importError }}</p>
            </div>
          </AppCard>
        </div>
      </template>
    </main>
  </div>
</template>
