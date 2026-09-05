<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useCommunityCatalogStore } from '@/stores/communityCatalog'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import {
  publishDiscordCommunityBatch,
  type CommunityWorkType,
  type DiscordCommunitySource,
  type DiscordBatchPublishResult,
} from '@/api/community'
import WorkCard from '@/components/community/WorkCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppDrawer from '@/components/ui/AppDrawer.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSegmentedControl from '@/components/ui/AppSegmentedControl.vue'
import AppCheckbox from '@/components/ui/AppCheckbox.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import { getApiErrorMessage } from '@/api/client'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const ui = useUiStore()

type HubSource = 'community' | 'discord'

const source = ref<HubSource>(route.query.source === 'discord' ? 'discord' : 'community')
const catalog = useCommunityCatalogStore()
const { works, loading, loadingMore, search, type, ranking, noImage, favoritesOnly, mineOnly, hasMore, activeTag, availableTags, error: catalogError } = storeToRefs(catalog)
const { loadWorks, loadTags } = catalog
const moreFiltersOpen = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null
const hasFilters = computed(() => Boolean(search.value.trim() || type.value || activeTag.value || favoritesOnly.value || mineOnly.value))
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

const sourceOptions = [
  { value: 'community' as const, label: 'AIBAR 社区' },
  { value: 'discord' as const, label: 'Discord 公共发布' },
]

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

function loadCommunityWorks() {
  if (searchTimer) clearTimeout(searchTimer)
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
watch([search, type, ranking, favoritesOnly, mineOnly, activeTag], (next, previous) => {
  catalog.cancelWorks()
  if (searchTimer) clearTimeout(searchTimer)
  const onlySearchChanged = next[0] !== previous[0] && next.slice(1).every((value, index) => value === previous[index + 1])
  if (onlySearchChanged && search.value.trim()) searchTimer = setTimeout(loadCommunityWorks, 250)
  else loadCommunityWorks()
})
watch(type, () => { void loadTags() })

// 后端 /api/characters/import 支持的全部卡体格式；ZIP/RAR/APK 等仍不支持
const CARD_FILE_EXTENSIONS = ['png', 'json', 'yaml', 'yml', 'charx', 'byaf'] as const

function cardExtensionOf(pathname: string): string {
  const ext = pathname.toLowerCase().split('.').pop() || ''
  return (CARD_FILE_EXTENSIONS as readonly string[]).includes(ext) ? ext : ''
}

function normalizeDiscordUrl(value: string): string {
  const parsed = new URL(value)
  const validHost = parsed.hostname === 'cdn.discordapp.com' || parsed.hostname === 'media.discordapp.net'
  if (!validHost || !parsed.pathname.includes('/attachments/') || !cardExtensionOf(parsed.pathname)) {
    throw new Error('请使用 Discord 附件中的角色卡文件链接（支持 PNG / JSON / CHARX / BYAF / YAML）')
  }
  parsed.hostname = 'cdn.discordapp.com'
  for (const key of ['format', 'quality', 'width', 'height']) parsed.searchParams.delete(key)
  return parsed.toString()
}

// 单项发布：卡体由服务器直接从 Discord CDN 抓取并导入，字节不再经过浏览器往返
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
    const normalizedUrl = normalizeDiscordUrl(importUrl.value.trim())
    const { results } = await publishDiscordCommunityBatch([
      { url: normalizedUrl, source: discordSource.value },
    ])
    if (!accountIsCurrent()) return
    const result = results[0]
    if (!result || result.status === 'failed') {
      throw new Error(result?.error || '服务器未返回发布结果')
    }
    publishedWorkId.value = result.workId || ''
    publishedStatus.value = result.status
    importResult.value = result.status === 'duplicate'
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

// ---- 批量发布：Worker 一次粘贴 JSON 数组，页面按 10 项分批调用服务器端批量端点 ----

interface DiscordBatchInputItem {
  url: string
  cardId: string
  threadId: string
  channelId: string
  sourceUrl: string
  title: string
  authorName?: string
  tags?: string[]
}

interface DiscordBatchRow {
  cardId: string
  title: string
  status: 'pending' | 'published' | 'duplicate' | 'failed'
  workId: string
  error: string
}

const DISCORD_GUILD_ID = '1380075940285124724'
const BATCH_CHUNK_SIZE = 10
const batchInput = ref('')
const batchRunning = ref(false)
const batchDone = ref(false)
const batchError = ref('')
const batchRows = ref<DiscordBatchRow[]>([])

function parseBatchInput(raw: string): DiscordBatchInputItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('批量输入不是有效 JSON')
  }
  if (!Array.isArray(parsed) || !parsed.length) throw new Error('批量输入必须是非空 JSON 数组')
  if (parsed.length > 100) throw new Error('单次批量最多 100 项')
  return parsed.map((entry, index) => {
    const record = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    const required = ['url', 'cardId', 'threadId', 'channelId', 'sourceUrl', 'title'] as const
    for (const key of required) {
      if (typeof record[key] !== 'string' || !(record[key] as string).trim()) {
        throw new Error(`第 ${index + 1} 项缺少 ${key}`)
      }
    }
    return {
      url: normalizeDiscordUrl(String(record.url).trim()),
      cardId: String(record.cardId).trim(),
      threadId: String(record.threadId).trim(),
      channelId: String(record.channelId).trim(),
      sourceUrl: String(record.sourceUrl).trim(),
      title: String(record.title).trim(),
      authorName: typeof record.authorName === 'string' ? record.authorName.trim() : '',
      tags: Array.isArray(record.tags) ? record.tags.map(tag => String(tag).trim()).filter(Boolean) : [],
    }
  })
}

async function runBatchPublish() {
  if (!session.isAdmin || batchRunning.value || !batchInput.value.trim()) return
  batchError.value = ''
  batchDone.value = false
  let items: DiscordBatchInputItem[]
  try {
    items = parseBatchInput(batchInput.value.trim())
  } catch (e: unknown) {
    batchError.value = getApiErrorMessage(e, '批量输入无效')
    return
  }
  batchRunning.value = true
  batchRows.value = items.map(item => ({
    cardId: item.cardId,
    title: item.title,
    status: 'pending',
    workId: '',
    error: '',
  }))
  try {
    for (let offset = 0; offset < items.length; offset += BATCH_CHUNK_SIZE) {
      const chunk = items.slice(offset, offset + BATCH_CHUNK_SIZE)
      let results: DiscordBatchPublishResult[] = []
      try {
        const response = await publishDiscordCommunityBatch(chunk.map(item => ({
          url: item.url,
          source: {
            guildId: DISCORD_GUILD_ID,
            channelId: item.channelId,
            threadId: item.threadId,
            cardId: item.cardId,
            sourceUrl: item.sourceUrl,
            title: item.title,
            authorName: item.authorName || '',
            tags: item.tags || [],
          },
        })))
        results = response.results
      } catch (e: unknown) {
        // 整批请求失败（限流/网络）：该批全部标失败，继续后续批次
        const message = getApiErrorMessage(e, '批量请求失败')
        for (let i = 0; i < chunk.length; i += 1) {
          batchRows.value[offset + i] = { ...batchRows.value[offset + i], status: 'failed', error: message }
        }
        continue
      }
      for (const result of results) {
        const row = batchRows.value[offset + result.index]
        if (!row) continue
        batchRows.value[offset + result.index] = {
          ...row,
          status: result.status,
          workId: result.workId || '',
          error: result.error || '',
        }
      }
    }
  } finally {
    batchRunning.value = false
    batchDone.value = true
  }
}

onMounted(() => {
  if (source.value === 'community') {
    void loadWorks()
    void loadTags()
  }
})

onBeforeUnmount(() => {
  catalog.cancel()
  if (searchTimer) clearTimeout(searchTimer)
})
</script>

<template>
  <div class="min-h-[100dvh] bg-bg">
    <AppPageHeader
      title="社区"
      subtitle="角色卡、故事与提示词"
      :show-back="false"
    >
      <template #actions>
        <AppButton v-if="source === 'community'" size="sm" variant="secondary" @click="router.push('/publish')">发布作品</AppButton>
      </template>
    </AppPageHeader>

    <main class="page-shell">
      <AppSegmentedControl
        v-model="source"
        class="mb-6"
        aria-label="社区来源"
        :options="sourceOptions"
        @update:model-value="selectSource"
      />

      <template v-if="source === 'community'">
        <div class="space-y-6">
          <div>
            <h2 class="text-2xl font-semibold tracking-tight md:text-3xl">发现下一段好故事</h2>
            <p class="mt-2 text-sm text-ink-secondary">探索社区分享的角色、故事开局与提示词。</p>
          </div>
          <!-- 筛选栏：搜索 + 类型/榜单分段控件 + 更多筛选抽屉 -->
          <div class="flex flex-col gap-3 border-b border-border pb-5">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
              <SearchInput v-model="search" class="min-w-0 flex-1" placeholder="搜索标题、作者或简介" size="lg" />
              <div class="flex flex-wrap items-center gap-2">
                <AppSegmentedControl v-model="type" size="sm" :options="typeFilters" aria-label="作品类型" />
                <button
                  class="inline-flex h-9 shrink-0 items-center rounded-lg border px-3 text-xs font-medium transition-colors"
                  :class="moreFiltersOpen || favoritesOnly || mineOnly || noImage || activeTag
                    ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                    : 'border-border bg-surface text-ink-secondary hover:bg-surface-sunken'"
                  @click="moreFiltersOpen = true"
                >
                  更多筛选
                  <span v-if="[favoritesOnly, mineOnly, noImage, Boolean(activeTag)].filter(Boolean).length" class="ml-1.5 rounded-full bg-brand-500 px-1.5 text-[10px] text-white">
                    {{ [favoritesOnly, mineOnly, noImage, Boolean(activeTag)].filter(Boolean).length }}
                  </span>
                </button>
              </div>
            </div>
            <div class="overflow-x-auto">
              <AppSegmentedControl v-model="ranking" size="sm" :options="rankings" aria-label="作品排序" />
            </div>
          </div>

          <div v-if="hasFilters" class="flex flex-wrap items-center gap-2 text-xs text-ink-secondary" aria-label="当前筛选">
            <span v-if="search.trim()" class="resource-tag">搜索：{{ search }}</span>
            <span v-if="activeTag" class="resource-tag">#{{ activeTag }}</span>
            <span v-if="favoritesOnly" class="resource-tag">我的收藏</span>
            <span v-if="mineOnly" class="resource-tag">我的作品</span>
            <button class="ml-auto min-h-8 text-brand-300 hover:underline" @click="catalog.clearFilters">重置筛选</button>
          </div>
          <div v-if="loading" class="resource-grid" role="status" aria-label="正在加载社区作品">
            <div v-for="n in 8" :key="n" class="overflow-hidden rounded-2xl bg-surface ring-1 ring-border-subtle">
              <div class="skeleton aspect-[4/5] w-full" />
              <div class="space-y-3 p-4"><div class="skeleton h-4 w-3/4" /><div class="skeleton h-3 w-1/2" /></div>
            </div>
          </div>
          <AppEmpty v-else-if="catalogError && !works.length" icon="box" title="社区暂时无法加载" :description="catalogError">
            <template #actions><AppButton variant="secondary" @click="loadWorks()">重新加载</AppButton></template>
          </AppEmpty>
          <AppEmpty v-else-if="!works.length" class="!py-8 md:!py-16" icon="search" :title="hasFilters ? '没有匹配的作品' : '社区里还没有作品'" :description="hasFilters ? '换个关键词，或清除筛选看看。' : '分享一个角色或故事，邀请大家一起体验。'">
            <template #actions>
              <AppButton v-if="hasFilters" variant="secondary" @click="catalog.clearFilters">清除筛选</AppButton>
              <AppButton v-else @click="router.push('/publish')">发布作品</AppButton>
            </template>
          </AppEmpty>
          <section v-else :class="noImage ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'resource-grid'">
            <WorkCard
              v-for="(work, index) in works"
              :key="work.id"
              class="h-full min-w-0"
              :work="work"
              :no-image="noImage"
              :eager="index < 5"
              @click="router.push(`/work/${encodeURIComponent(work.id)}`)"
            />
          </section>
          <p v-if="catalogError && works.length" class="text-center text-sm text-danger" role="alert">{{ catalogError }}，可重试加载更多。</p>
          <div v-if="hasMore" class="flex justify-center">
            <AppButton variant="secondary" :loading="loadingMore" @click="loadMoreWorks">{{ loadingMore ? '加载中…' : '加载更多' }}</AppButton>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="mx-auto max-w-3xl">
          <AppCard padding="lg">
            <div class="space-y-4">
              <div>
                <h2 class="text-base font-semibold text-ink-primary">发布 Discord 角色卡</h2>
                <p class="mt-1 text-sm text-ink-muted">支持 PNG / JSON / CHARX / BYAF / YAML 卡体，解析完成后立即发布为公共作品。</p>
              </div>
              <div v-if="discordSource" class="border-l-2 border-brand-500 pl-3">
                <p class="text-sm font-medium text-ink-primary">{{ discordSource.title }}</p>
                <p class="mt-1 text-xs text-ink-muted">{{ discordSource.authorName || 'Discord 作者' }}</p>
              </div>
              <p v-else class="text-sm text-warning-strong" data-testid="discord-publish-context-error">缺少 Discord 帖子来源，请从本地同步控制台选择角色卡并发起发布。</p>
              <div class="flex flex-col gap-3 md:flex-row">
                <AppInput
                  v-model="importUrl"
                  data-testid="discord-png-import-input"
                  type="url"
                  placeholder="cdn.discordapp.com/attachments/.../角色卡文件"
                  class="min-w-0 flex-1"
                  @keydown.enter.prevent="importFromDiscord"
                />
                <AppButton
                  data-testid="discord-png-import-submit"
                  :loading="importing"
                  :disabled="!importUrl.trim() || !discordSource"
                  @click="importFromDiscord"
                >{{ importing ? '发布中…' : '发布到公共区' }}</AppButton>
              </div>
              <div v-if="importResult" class="flex flex-wrap items-center gap-3">
                <p
                  data-testid="discord-png-import-result"
                  :data-publish-status="publishedStatus"
                  :data-work-id="publishedWorkId"
                  class="text-sm text-success-strong"
                >{{ importResult }}</p>
                <AppButton size="sm" variant="secondary" @click="router.push(`/work/${encodeURIComponent(publishedWorkId)}`)">查看公共作品</AppButton>
              </div>
              <p v-if="importError" data-testid="discord-png-import-error" class="text-sm text-danger-strong">{{ importError }}</p>
            </div>
          </AppCard>

          <!-- 批量发布：仅管理员可见。Worker 一次粘贴全部条目，服务器端并发抓取与发布 -->
          <AppCard v-if="session.isAdmin" padding="lg" class="mt-6">
            <div class="space-y-4">
              <div>
                <h2 class="text-base font-semibold text-ink-primary">批量发布</h2>
                <p class="mt-1 text-sm text-ink-muted">
                  粘贴 JSON 数组，每项包含 url、cardId、threadId、channelId、sourceUrl、title，可选 authorName、tags。
                  服务器直接抓取附件并发布，每批 10 项自动分批。
                </p>
              </div>
              <AppTextarea
                v-model="batchInput"
                data-testid="discord-batch-input"
                :rows="5"
                :disabled="batchRunning"
                placeholder='[{"url":"https://cdn.discordapp.com/attachments/...","cardId":"...","threadId":"...","channelId":"...","sourceUrl":"https://discord.com/channels/...","title":"...","authorName":"...","tags":["原创"]}]'
              />
              <div class="flex flex-wrap items-center gap-3">
                <AppButton
                  data-testid="discord-batch-submit"
                  :loading="batchRunning"
                  :disabled="!batchInput.trim()"
                  @click="runBatchPublish"
                >{{ batchRunning ? '批量发布中…' : '批量发布' }}</AppButton>
                <p
                  data-testid="discord-batch-status"
                  :data-batch-state="batchRunning ? 'running' : batchDone ? 'done' : 'idle'"
                  class="text-sm text-ink-muted"
                >
                  <template v-if="batchRunning">处理中 {{ batchRows.filter(row => row.status !== 'pending').length }} / {{ batchRows.length }}</template>
                  <template v-else-if="batchDone">已完成 {{ batchRows.length }} 项</template>
                  <template v-else>等待批量输入</template>
                </p>
                <p v-if="batchError" data-testid="discord-batch-error" class="text-sm text-danger-strong">{{ batchError }}</p>
              </div>
              <ul v-if="batchRows.length" class="divide-y divide-border-subtle rounded-lg border border-border">
                <li
                  v-for="row in batchRows"
                  :key="row.cardId"
                  data-testid="discord-batch-item"
                  :data-card-id="row.cardId"
                  :data-publish-status="row.status"
                  :data-work-id="row.workId"
                  class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span class="min-w-0 flex-1 truncate text-ink-primary">{{ row.title }}</span>
                  <span
                    :class="row.status === 'failed' ? 'text-danger' : row.status === 'pending' ? 'text-ink-muted' : 'text-success-strong'"
                  >{{ row.status === 'pending' ? '等待' : row.status === 'published' ? '已发布' : row.status === 'duplicate' ? '重复关联' : `失败：${row.error}` }}</span>
                  <AppButton
                    v-if="row.workId"
                    size="sm"
                    variant="secondary"
                    @click="router.push(`/work/${encodeURIComponent(row.workId)}`)"
                  >查看</AppButton>
                </li>
              </ul>
            </div>
          </AppCard>
        </div>
      </template>
    </main>

    <!-- 更多筛选抽屉 -->
    <AppDrawer v-model="moreFiltersOpen" title="更多筛选" padded>
      <div class="space-y-5">
        <div class="space-y-3">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">筛选条件</h4>
          <div class="space-y-2">
            <AppCheckbox v-model="favoritesOnly">仅看收藏</AppCheckbox>
            <AppCheckbox v-model="mineOnly">仅看我发布的</AppCheckbox>
            <AppCheckbox v-model="noImage">无图模式</AppCheckbox>
          </div>
        </div>

        <div v-if="availableTags.length" class="space-y-3">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">标签</h4>
          <div class="flex flex-wrap gap-2">
            <button
              :class="[
                'inline-flex items-center rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                !activeTag
                  ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                  : 'border-border bg-surface text-ink-secondary hover:bg-surface-sunken',
              ]"
              @click="activeTag = ''"
            >全部标签</button>
            <button
              v-for="item in availableTags"
              :key="item.tag"
              :class="[
                'inline-flex items-center rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                activeTag === item.tag
                  ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                  : 'border-border bg-surface text-ink-secondary hover:bg-surface-sunken',
              ]"
              @click="activeTag = activeTag === item.tag ? '' : item.tag"
            >#{{ item.tag }} <span class="ml-0.5 opacity-70">{{ item.count }}</span></button>
          </div>
        </div>

        <div class="flex gap-2 pt-2">
          <AppButton variant="secondary" class="flex-1" @click="favoritesOnly = false; mineOnly = false; noImage = false; activeTag = ''">重置</AppButton>
          <AppButton class="flex-1" @click="moreFiltersOpen = false">完成</AppButton>
        </div>
      </div>
    </AppDrawer>
  </div>
</template>
