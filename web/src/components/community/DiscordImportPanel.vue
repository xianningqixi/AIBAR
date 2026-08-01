<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { apiPostBlob } from '@/api/client'
import { fetchCharacter, importCharacter, mergeAttributes } from '@/api/characters'
import { useCharactersStore } from '@/stores/characters'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { characterGreetings, saveStoryFromCharacterGreeting } from '@/lib/storyFromCharacter'
import {
  DISCORD_IMPORT_CHANNEL_ID,
  DISCORD_IMPORT_GUILD_ID,
  DISCORD_IMPORT_TIMEZONE,
  cancelDiscordImportBatch,
  clearDiscordImportQueue,
  getDiscordImportQueueStorageKey,
  isDiscordCdnPreviewUrl,
  loadDiscordImportQueue,
  mergeDiscordImportQueue,
  parseDiscordImportManifest,
  requestDiscordImportBatch,
  resolveDiscordImportBatchItem,
  saveDiscordImportQueue,
  updateDiscordImportQueueItem,
  type DiscordImportCard,
  type DiscordImportQueue,
  type DiscordImportQueueItem,
  type DiscordImportQueueItemStatus,
} from '@/lib/discordImportQueue'
import AppButton from '@/components/ui/AppButton.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'

interface DiscordImportRow {
  card: DiscordImportCard
  item: DiscordImportQueueItem
}

interface ImportAccountContext {
  handle: string
  epoch: number
}

const chars = useCharactersStore()
const session = useSessionStore()
const ui = useUiStore()
const manifestInput = ref<HTMLInputElement>()
const manifestDraftOpen = ref(false)
const manifestDraft = ref('')
const manifestError = ref('')
const rowMessages = ref<Record<string, string>>({})
const cardUrlDrafts = ref<Record<string, string>>({})
const urlFetchingCardId = ref('')

const allowedCardExtensions = new Set(['png', 'json', 'yaml', 'yml', 'charx', 'byaf'])
const maxCardFileBytes = 20 * 1024 * 1024
let accountEpoch = 0

function normalizeBrowserItems(value: DiscordImportQueue, recoverInterrupted = false): DiscordImportQueue {
  const availabilityById = new Map(value.manifest.cards.map((card) => [card.id, card.resource.availability]))
  return {
    ...value,
    items: value.items.map((item) => {
      if (recoverInterrupted && item.status === 'importing') {
        return { ...item, status: 'failed' as const, error: '上次导入已中断，请重试' }
      }
      return availabilityById.get(item.id) === 'browser' && item.status === 'unsupported'
        ? { ...item, status: 'ready' as const }
        : item
    }),
  }
}

const accountHandle = computed(() => session.user?.handle || '')
const queueStorageKey = computed(() => getDiscordImportQueueStorageKey(accountHandle.value))
const storedQueue = loadDiscordImportQueue(accountHandle.value)
const queue = ref<DiscordImportQueue | null>(storedQueue ? normalizeBrowserItems(storedQueue, true) : null)
if (queue.value) saveDiscordImportQueue(queue.value, accountHandle.value)

function onQueueStorage(event: StorageEvent) {
  if (event.storageArea !== window.localStorage || event.key !== queueStorageKey.value) return
  const stored = loadDiscordImportQueue(accountHandle.value)
  queue.value = stored ? normalizeBrowserItems(stored) : null
}

watch(accountHandle, (handle) => {
  accountEpoch += 1
  const stored = loadDiscordImportQueue(handle)
  queue.value = stored ? normalizeBrowserItems(stored, true) : null
  rowMessages.value = {}
  cardUrlDrafts.value = {}
  urlFetchingCardId.value = ''
})

onMounted(() => window.addEventListener('storage', onQueueStorage))
onBeforeUnmount(() => window.removeEventListener('storage', onQueueStorage))

const rows = computed<DiscordImportRow[]>(() => {
  if (!queue.value) return []
  const itemById = new Map(queue.value.items.map((item) => [item.id, item]))
  return queue.value.manifest.cards.flatMap((card) => {
    const item = itemById.get(card.id)
    return item ? [{ card, item }] : []
  })
})

const selectableRows = computed(() => rows.value.filter(({ card, item }) => (
  card.resource.availability !== 'unsupported'
  && item.status !== 'imported'
  && item.status !== 'importing'
)))
const selectedCount = computed(() => selectableRows.value.filter(({ item }) => item.selected).length)
const importedCount = computed(() => rows.value.filter(({ item }) => item.status === 'imported').length)
const failedCount = computed(() => rows.value.filter(({ item }) => item.status === 'failed').length)
const unsupportedCount = computed(() => rows.value.filter(({ item }) => item.status === 'unsupported').length)
const allSelectableSelected = computed(() => (
  selectableRows.value.length > 0
  && selectableRows.value.every(({ item }) => item.selected)
))
const hasActiveImport = computed(() => (
  Boolean(urlFetchingCardId.value)
  || rows.value.some(({ item }) => item.status === 'importing')
))
const requestedCardIds = computed(() => new Set(queue.value?.importRequest?.cardIds || []))
const requestedCount = computed(() => requestedCardIds.value.size)
const hasPendingBrowserRequest = computed(() => requestedCount.value > 0)
const controlsLocked = computed(() => hasActiveImport.value || hasPendingBrowserRequest.value)

function captureImportContext(): ImportAccountContext | null {
  const handle = accountHandle.value
  return handle ? { handle, epoch: accountEpoch } : null
}

function isCurrentImportContext(context: ImportAccountContext | null): context is ImportAccountContext {
  return Boolean(
    context
    && context.epoch === accountEpoch
    && context.handle === accountHandle.value,
  )
}

function commitQueue(next: DiscordImportQueue, context: ImportAccountContext | null = null): boolean {
  if (context && !isCurrentImportContext(context)) return false
  const handle = context?.handle || accountHandle.value
  if (!handle) return false
  const normalized = normalizeBrowserItems(next)
  if (!saveDiscordImportQueue(normalized, handle)) {
    ui.addToast('无法保存 Discord 导入队列，请检查浏览器存储权限', 'error')
    return false
  }
  queue.value = normalized
  return true
}

function clearQueue() {
  if (controlsLocked.value) return
  if (!clearDiscordImportQueue(accountHandle.value)) {
    ui.addToast('清空本地队列失败', 'error')
    return
  }
  queue.value = null
  manifestError.value = ''
  manifestDraft.value = ''
  manifestDraftOpen.value = false
  rowMessages.value = {}
  ui.addToast('Discord 导入队列已清空', 'success')
}

function chooseManifest() {
  if (controlsLocked.value || !manifestInput.value) return
  manifestInput.value.value = ''
  manifestInput.value.click()
}

async function onManifestSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const context = captureImportContext()

  try {
    const text = await file.text()
    if (!isCurrentImportContext(context)) return
    applyManifest(text)
  } catch (error: any) {
    if (!isCurrentImportContext(context)) return
    manifestError.value = error?.message || '无法读取同步清单'
    ui.addToast(`清单载入失败：${manifestError.value}`, 'error')
  } finally {
    input.value = ''
  }
}

function applyManifest(input: unknown) {
  if (controlsLocked.value) {
    manifestError.value = hasPendingBrowserRequest.value
      ? '已有浏览器导入请求，请先取消或等待处理完成'
      : '有角色卡正在导入，请等待当前项目完成'
    ui.addToast(manifestError.value, 'warning')
    return
  }
  manifestError.value = ''
  try {
    const manifest = parseDiscordImportManifest(input)
    commitQueue(mergeDiscordImportQueue(queue.value, manifest))
    const currentIds = new Set(manifest.cards.map((card) => card.id))
    rowMessages.value = Object.fromEntries(
      Object.entries(rowMessages.value).filter(([id]) => currentIds.has(id)),
    )
    ui.addToast(`已载入 ${manifest.cards.length} 张 Discord 候选卡`, 'success')
  } catch (error: any) {
    manifestError.value = error?.message || '同步清单格式无效'
    ui.addToast(`清单载入失败：${manifestError.value}`, 'error')
  }
}

function applyManifestDraft() {
  applyManifest(manifestDraft.value)
  if (manifestError.value) return
  manifestDraft.value = ''
  manifestDraftOpen.value = false
}

function canSelect(row: DiscordImportRow): boolean {
  return row.card.resource.availability !== 'unsupported'
    && row.item.status !== 'imported'
    && row.item.status !== 'importing'
}

function isRequested(row: DiscordImportRow): boolean {
  return requestedCardIds.value.has(row.card.id)
}

function requestSelectedImport() {
  if (!queue.value || controlsLocked.value || !selectedCount.value) return
  try {
    const next = requestDiscordImportBatch(queue.value)
    if (commitQueue(next)) ui.addToast(`已授权浏览器自动导入 ${next.importRequest?.cardIds.length || 0} 项`, 'success')
  } catch (error: any) {
    ui.addToast(error?.message || '无法提交浏览器导入请求', 'error')
  }
}

function cancelSelectedImport() {
  if (!queue.value || hasActiveImport.value || !hasPendingBrowserRequest.value) return
  commitQueue(cancelDiscordImportBatch(queue.value))
  ui.addToast('已取消浏览器导入请求', 'info')
}

function failRequestedImport(row: DiscordImportRow) {
  if (!queue.value || hasActiveImport.value || !isRequested(row)) return
  const message = '浏览器未获取到受支持的角色卡文件，已跳过此项'
  commitQueue(resolveDiscordImportBatchItem(queue.value, row.card.id, {
    status: 'failed',
    error: message,
  }))
  setRowMessage(row.card.id, message)
  ui.addToast(message, 'warning')
}

function setSelected(id: string, selected: boolean) {
  if (controlsLocked.value || !queue.value) return
  const row = rows.value.find(({ card }) => card.id === id)
  if (!row || !canSelect(row)) return
  commitQueue(updateDiscordImportQueueItem(queue.value, id, { selected }))
}

function onSelectionChange(id: string, event: Event) {
  setSelected(id, (event.target as HTMLInputElement).checked)
}

function toggleSelectAll() {
  if (controlsLocked.value || !queue.value || !selectableRows.value.length) return
  const selected = !allSelectableSelected.value
  const selectableIds = new Set(selectableRows.value.map(({ card }) => card.id))
  commitQueue({
    ...queue.value,
    items: queue.value.items.map((item) => (
      selectableIds.has(item.id) ? { ...item, selected } : item
    )),
    updatedAt: new Date().toISOString(),
  })
}

function chooseCardFile(row: DiscordImportRow) {
  if (hasActiveImport.value || !isRequested(row) || !row.item.selected || !canSelect(row)) return
  const input = document.querySelector<HTMLInputElement>(`[data-testid="discord-card-file-${CSS.escape(row.card.id)}"]`)
  if (!input) return
  input.value = ''
  input.click()
}

function onCardUrlInput(id: string, event: Event) {
  cardUrlDrafts.value = {
    ...cardUrlDrafts.value,
    [id]: (event.target as HTMLInputElement).value,
  }
}

function cardFileNameFromUrl(value: string): string {
  const fileName = decodeURIComponent(new URL(value).pathname.split('/').pop() || '')
  if (!fileName || /[/\\]/.test(fileName)) throw new Error('Discord 卡体链接缺少有效文件名')
  return fileName
}

async function sha256(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器无法计算文件指纹')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function cardFileExtension(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() || ''
}

function findImportedAvatar(threadId: string, fileSha256: string): string {
  for (const character of chars.characters) {
    const extensions = character.data?.extensions
    const aibar = extensions?.aibar
    if (!aibar || typeof aibar !== 'object' || Array.isArray(aibar)) continue
    const discord = (aibar as Record<string, unknown>).discord
    if (!discord || typeof discord !== 'object' || Array.isArray(discord)) continue
    const source = discord as Record<string, unknown>
    const storedThreadId = source.threadId ?? source.thread
    if (storedThreadId === threadId && source.fileSha256 === fileSha256) return character.avatar
  }
  return ''
}

function setRowMessage(id: string, message: string) {
  rowMessages.value = { ...rowMessages.value, [id]: message }
}

async function importCardFile(
  card: DiscordImportCard,
  file: File,
  context: ImportAccountContext | null = captureImportContext(),
) {
  if (!queue.value || !isCurrentImportContext(context)) return
  const extension = cardFileExtension(file)
  if (!allowedCardExtensions.has(extension)) {
    const message = '请选择 PNG、JSON、YAML、charx 或 byaf 角色卡文件'
    commitQueue(resolveDiscordImportBatchItem(queue.value, card.id, { status: 'failed', error: message }), context)
    setRowMessage(card.id, message)
    ui.addToast(message, 'error')
    return
  }
  if (file.size === 0 || file.size > maxCardFileBytes) {
    const message = file.size === 0 ? '角色卡文件为空' : '角色卡文件不能超过 20 MB'
    commitQueue(resolveDiscordImportBatchItem(queue.value, card.id, { status: 'failed', error: message }), context)
    setRowMessage(card.id, message)
    ui.addToast(message, 'error')
    return
  }

  commitQueue(updateDiscordImportQueueItem(queue.value, card.id, { status: 'importing' }), context)
  setRowMessage(card.id, '正在校验并导入卡体…')

  let roleImported = false
  try {
    const fileSha256 = await sha256(file)
    if (!isCurrentImportContext(context)) return
    const importedHash = `${card.threadId}:${fileSha256}`
    if (!chars.characters.length) await chars.load()
    if (!isCurrentImportContext(context)) return
    const existingAvatar = findImportedAvatar(card.threadId, fileSha256)
    if (queue.value.importedHashes.includes(importedHash) || existingAvatar) {
      commitQueue(resolveDiscordImportBatchItem(queue.value, card.id, {
        status: 'imported',
        selected: false,
        ...(existingAvatar ? { importedAvatar: existingAvatar } : {}),
        importedHash,
      }), context)
      const message = '该帖子中的同一卡体已经导入，已跳过重复写入'
      setRowMessage(card.id, message)
      ui.addToast(message, 'info')
      return
    }

    if (!isCurrentImportContext(context)) return
    const imported = await importCharacter(file)
    if (!isCurrentImportContext(context)) return
    const avatar = imported.file_name ? `${imported.file_name}.png` : ''
    if (!avatar) throw new Error('后端没有返回已导入角色文件名')

    const importedAt = new Date().toISOString()
    commitQueue(resolveDiscordImportBatchItem(queue.value, card.id, {
      status: 'imported',
      selected: false,
      importedAvatar: avatar,
      importedHash,
    }), context)
    roleImported = true

    const issues: string[] = []
    try {
      if (!isCurrentImportContext(context)) return
      await mergeAttributes(avatar, {
        data: {
          extensions: {
            aibar: {
              discord: {
                guildId: DISCORD_IMPORT_GUILD_ID,
                channelId: DISCORD_IMPORT_CHANNEL_ID,
                threadId: card.threadId,
                cardId: card.id,
                sourceUrl: card.sourceUrl,
                fileSha256,
                dedupeKey: importedHash,
                importedAt,
              },
            },
          },
        },
      })
    } catch (error: any) {
      if (!isCurrentImportContext(context)) return
      issues.push(`来源标记失败：${error?.message || '未知错误'}`)
    }
    if (!isCurrentImportContext(context)) return

    let storyCreated = false
    let hasGreeting = false
    try {
      if (!isCurrentImportContext(context)) return
      const character = await fetchCharacter(avatar)
      if (!isCurrentImportContext(context)) return
      const greeting = characterGreetings(character)[0]
      hasGreeting = Boolean(greeting)
      if (greeting) {
        if (!isCurrentImportContext(context)) return
        await saveStoryFromCharacterGreeting(character, greeting, 0)
        if (!isCurrentImportContext(context)) return
        storyCreated = true
      }
    } catch (error: any) {
      if (!isCurrentImportContext(context)) return
      issues.push(`故事卡生成失败：${error?.message || '未知错误'}`)
    }
    if (!isCurrentImportContext(context)) return

    const baseMessage = storyCreated
      ? '角色卡已导入，并生成了故事卡'
      : hasGreeting
        ? '角色卡已导入，但故事卡生成失败'
        : '角色卡已导入；没有开场白，未生成故事卡'
    const message = issues.length ? `${baseMessage}；${issues.join('；')}` : baseMessage
    setRowMessage(card.id, message)
    ui.addToast(message, issues.length ? 'warning' : 'success', issues.length ? 5000 : 3000)
  } catch (error: any) {
    if (!isCurrentImportContext(context)) return
    const message = error?.message || '角色卡导入失败'
    if (!roleImported && queue.value) {
      commitQueue(resolveDiscordImportBatchItem(queue.value, card.id, {
        status: 'failed',
        error: message,
      }), context)
    }
    setRowMessage(card.id, roleImported ? `角色卡已导入；后续处理失败：${message}` : message)
    ui.addToast(roleImported ? `角色卡已导入；后续处理失败：${message}` : `导入失败：${message}`, roleImported ? 'warning' : 'error')
  } finally {
    if (roleImported && isCurrentImportContext(context)) await chars.load()
  }
}

async function importCardUrl(row: DiscordImportRow) {
  if (!queue.value || hasActiveImport.value || !isRequested(row)) return
  const context = captureImportContext()
  if (!isCurrentImportContext(context)) return
  const sourceUrl = (cardUrlDrafts.value[row.card.id] || '').trim()
  if (!isDiscordCdnPreviewUrl(sourceUrl)) {
    ui.addToast('卡体链接必须是 Discord CDN 附件地址', 'error')
    return
  }

  let fileName: string
  try {
    fileName = cardFileNameFromUrl(sourceUrl)
  } catch (error: any) {
    ui.addToast(error?.message || 'Discord 卡体链接无效', 'error')
    return
  }
  if (!allowedCardExtensions.has(fileName.split('.').pop()?.toLowerCase() || '')) {
    ui.addToast('Discord 链接不是受支持的角色卡文件', 'error')
    return
  }

  urlFetchingCardId.value = row.card.id
  setRowMessage(row.card.id, '正在从 Discord 获取卡体…')
  try {
    const blob = await apiPostBlob('/api/aibar/discord-import/fetch', { url: sourceUrl })
    if (!isCurrentImportContext(context)) return
    if (blob.size === 0) throw new Error('Discord 返回的角色卡文件为空')
    if (blob.size > maxCardFileBytes) throw new Error('角色卡文件不能超过 20 MB')

    await importCardFile(row.card, new File([blob], fileName, {
      type: blob.type || 'application/octet-stream',
    }), context)
  } catch (error: any) {
    if (!isCurrentImportContext(context)) return
    const message = error?.message || '无法从 Discord 获取角色卡文件'
    if (queue.value?.importRequest?.cardIds.includes(row.card.id)) {
      commitQueue(resolveDiscordImportBatchItem(queue.value, row.card.id, {
        status: 'failed',
        error: message,
      }), context)
    }
    setRowMessage(row.card.id, message)
    ui.addToast(message, 'error')
  } finally {
    if (isCurrentImportContext(context)) urlFetchingCardId.value = ''
  }
}

async function onCardFileSelected(card: DiscordImportCard, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (hasActiveImport.value || !file || !queue.value?.importRequest?.cardIds.includes(card.id)) return
  await importCardFile(card, file, captureImportContext())
}

function formatTimestamp(value?: string): string {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: DISCORD_IMPORT_TIMEZONE,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function periodLabel(value: DiscordImportQueue['manifest']['period']): string {
  return value === 'today' ? '今日' : '滚动 24 小时'
}

function sortLabel(value: DiscordImportQueue['manifest']['sort']): string {
  return value === 'reactions' ? '按回应热度' : '按活跃度'
}

function availabilityLabel(card: DiscordImportCard): string {
  if (card.resource.availability === 'ready') return '卡体就绪'
  if (card.resource.availability === 'browser') return '浏览器获取'
  return '暂不支持'
}

function statusLabel(status: DiscordImportQueueItemStatus): string {
  const labels: Record<DiscordImportQueueItemStatus, string> = {
    ready: '待导入',
    importing: '导入中',
    imported: '已导入',
    unsupported: '不支持',
    failed: '导入失败',
  }
  return labels[status]
}

function statusClass(status: DiscordImportQueueItemStatus): string {
  const classes: Record<DiscordImportQueueItemStatus, string> = {
    ready: 'bg-surface-sunken text-ink-secondary',
    importing: 'bg-amber-50 text-amber-700',
    imported: 'bg-emerald-50 text-emerald-700',
    unsupported: 'bg-surface-sunken text-ink-muted',
    failed: 'bg-red-50 text-red-700',
  }
  return classes[status]
}
</script>

<template>
  <section
    data-testid="discord-import-panel"
    class="space-y-5"
    :data-discord-import-queue-storage-key="queueStorageKey"
    :data-import-request-state="hasPendingBrowserRequest ? 'pending' : 'idle'"
    :data-import-request-id="queue?.importRequest?.requestedAt || undefined"
    :data-import-request-card-ids="queue?.importRequest?.cardIds.join(',') || undefined"
    :data-import-requested-at="queue?.importRequest?.requestedAt || undefined"
  >
    <input
      ref="manifestInput"
      data-testid="discord-manifest-input"
      type="file"
      accept=".json,application/json"
      class="hidden"
      @change="onManifestSelected"
    />
    <div class="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div class="min-w-0">
        <p class="text-xs font-semibold text-emerald-700">Discord 同步清单</p>
        <h2 class="mt-1 text-lg font-semibold text-ink-primary">今日热门角色卡</h2>
        <p v-if="queue" data-testid="discord-sync-meta" class="mt-1 text-xs text-ink-muted">
          {{ queue.manifest.channelName }} · {{ periodLabel(queue.manifest.period) }} · {{ sortLabel(queue.manifest.sort) }} · 同步于 {{ formatTimestamp(queue.manifest.syncedAt) }}
        </p>
      </div>
      <div class="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
        <div class="flex flex-wrap items-center gap-2">
          <span v-if="selectedCount" class="text-xs text-ink-muted">已选 {{ selectedCount }}</span>
          <span v-if="hasPendingBrowserRequest" data-testid="discord-import-request-state" class="text-xs font-medium text-amber-700">
            等待浏览器自动导入 {{ requestedCount }} 项
          </span>
          <span v-if="importedCount" class="text-xs text-emerald-700">已导入 {{ importedCount }}</span>
          <span v-if="failedCount" class="text-xs text-red-700">失败 {{ failedCount }}</span>
          <span v-if="unsupportedCount" class="text-xs text-ink-muted">不支持 {{ unsupportedCount }}</span>
        </div>
        <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <AppButton
            v-if="queue && selectableRows.length && !hasPendingBrowserRequest"
            data-testid="discord-import-selected"
            size="sm"
            :disabled="hasActiveImport || !selectedCount"
            @click="requestSelectedImport"
          >
            导入已选<span v-if="selectedCount">（{{ selectedCount }}）</span>
          </AppButton>
          <AppButton
            v-else-if="hasPendingBrowserRequest"
            data-testid="discord-import-cancel"
            size="sm"
            variant="secondary"
            :disabled="hasActiveImport"
            @click="cancelSelectedImport"
          >取消导入请求</AppButton>
          <AppButton
            v-if="queue && selectableRows.length"
            data-testid="discord-select-all"
            size="sm"
            variant="secondary"
            :disabled="controlsLocked"
            @click="toggleSelectAll"
          >
            {{ allSelectableSelected ? '取消全选' : '全选未导入' }}
          </AppButton>
          <AppButton data-testid="discord-manifest-trigger" size="sm" variant="secondary" :disabled="controlsLocked" @click="chooseManifest">
            {{ queue ? '更新清单' : '载入清单' }}
          </AppButton>
          <AppButton
            data-testid="discord-manifest-paste-trigger"
            size="sm"
            variant="secondary"
            :disabled="controlsLocked"
            @click="manifestDraftOpen = !manifestDraftOpen"
          >{{ manifestDraftOpen ? '收起粘贴' : '粘贴清单' }}</AppButton>
          <AppButton
            v-if="queue"
            data-testid="discord-queue-clear"
            size="sm"
            variant="ghost"
            :disabled="controlsLocked"
            @click="clearQueue"
          >清空</AppButton>
        </div>
      </div>
    </div>

    <div v-if="manifestDraftOpen" class="border-b border-border pb-5" data-testid="discord-manifest-paste-panel">
      <textarea
        v-model="manifestDraft"
        data-testid="discord-manifest-json"
        rows="7"
        placeholder="同步清单 JSON"
        class="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-ink-primary placeholder:text-ink-muted focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
      />
      <div class="mt-2 flex justify-end gap-2">
        <AppButton size="sm" variant="ghost" @click="manifestDraftOpen = false">取消</AppButton>
        <AppButton data-testid="discord-manifest-apply" size="sm" :disabled="controlsLocked || !manifestDraft.trim()" @click="applyManifestDraft">应用清单</AppButton>
      </div>
    </div>

    <p v-if="manifestError" data-testid="discord-manifest-error" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ manifestError }}
    </p>

    <AppEmpty
      v-if="!queue"
      icon="box"
      title="尚未载入 Discord 清单"
      description="载入今日同步清单后，可勾选候选并导入卡体。"
    >
      <template #actions>
        <AppButton size="sm" @click="chooseManifest">载入 JSON 清单</AppButton>
      </template>
    </AppEmpty>

    <AppEmpty
      v-else-if="!rows.length"
      icon="search"
      title="今日暂无候选卡"
      description="可以稍后载入更新后的同步清单。"
    />

    <div v-else data-testid="discord-cards-list" class="space-y-3">
      <article
        v-for="row in rows"
        :key="row.card.id"
        :data-discord-card-id="row.card.id"
        class="relative grid min-w-0 grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-md border border-border bg-surface p-3 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:items-start"
        :class="[
          row.item.selected ? 'border-emerald-500/60 bg-emerald-50/30' : '',
          isRequested(row) ? 'ring-1 ring-amber-400/60' : '',
        ]"
      >
        <input
          v-if="isRequested(row)"
          type="file"
          accept=".png,.json,.yaml,.yml,.charx,.byaf"
          class="hidden"
          :data-testid="`discord-card-file-${row.card.id}`"
          @change="onCardFileSelected(row.card, $event)"
        />
        <label class="absolute left-4 top-4 z-10 flex h-6 w-6 items-center justify-center rounded bg-surface/90 shadow-sm" :title="canSelect(row) ? '选择角色卡' : statusLabel(row.item.status)">
          <input
            type="checkbox"
            class="h-4 w-4 accent-emerald-600"
            :data-testid="`discord-select-${row.card.id}`"
            :checked="row.item.selected"
            :disabled="controlsLocked || !canSelect(row)"
            :aria-label="`选择 ${row.card.title}`"
            @change="onSelectionChange(row.card.id, $event)"
          />
        </label>

        <div class="h-20 w-14 overflow-hidden rounded bg-surface-sunken sm:h-28 sm:w-[88px]">
          <img
            v-if="row.card.previewUrl"
            :src="row.card.previewUrl"
            :alt="row.card.title"
            class="h-full w-full object-cover"
            loading="lazy"
            referrerpolicy="no-referrer"
          />
          <div v-else class="flex h-full items-center justify-center px-2 text-center text-[11px] text-ink-muted">无预览</div>
        </div>

        <div class="min-w-0">
          <div class="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
            <h3 class="min-w-0 break-words text-sm font-semibold text-ink-primary">{{ row.card.title }}</h3>
            <span
              :data-testid="`discord-status-${row.card.id}`"
              class="shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold"
              :class="isRequested(row) ? 'bg-amber-50 text-amber-700' : statusClass(row.item.status)"
            >{{ isRequested(row) ? '等待浏览器' : statusLabel(row.item.status) }}</span>
            <span class="shrink-0 rounded bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-muted">
              {{ availabilityLabel(row.card) }}
            </span>
          </div>
          <p class="mt-1 text-xs text-ink-muted">{{ row.card.authorName }}</p>
          <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted">
            <span>回应 {{ row.card.reactionCount }}</span>
            <span>回复 {{ row.card.replyCount }}</span>
            <span v-if="row.card.publishedAt">发布 {{ formatTimestamp(row.card.publishedAt) }}</span>
            <span v-if="row.card.lastActiveAt">活跃 {{ formatTimestamp(row.card.lastActiveAt) }}</span>
          </div>
          <div v-if="row.card.tags.length" class="mt-2 flex flex-wrap gap-1">
            <span
              v-for="tag in row.card.tags"
              :key="tag"
              class="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700"
            >{{ tag }}</span>
          </div>
          <p v-if="row.card.resource.note" class="mt-2 text-xs leading-relaxed text-ink-secondary">
            {{ row.card.resource.note }}
          </p>
          <p
            v-if="rowMessages[row.card.id] || row.item.error"
            :data-testid="`discord-message-${row.card.id}`"
            class="mt-2 text-xs leading-relaxed"
            :class="row.item.status === 'failed' ? 'text-red-700' : row.item.status === 'imported' ? 'text-emerald-700' : 'text-ink-secondary'"
          >
            {{ rowMessages[row.card.id] || row.item.error }}
          </p>
        </div>

        <div class="col-span-2 grid min-w-0 grid-cols-2 items-center gap-2 border-t border-border-subtle pt-3 sm:col-span-1 sm:flex sm:flex-col sm:items-end sm:border-0 sm:pt-0">
          <a
            :href="row.card.sourceUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-8 items-center justify-center text-center text-xs font-medium text-emerald-700 hover:text-emerald-800 sm:justify-end"
            :data-testid="`discord-source-${row.card.id}`"
          >打开来源帖</a>
          <template v-if="isRequested(row)">
            <input
              type="url"
              :data-testid="`discord-card-url-${row.card.id}`"
              :value="cardUrlDrafts[row.card.id] || ''"
              aria-label="Discord 卡体链接"
              placeholder="Discord 卡体链接"
              class="col-span-2 min-h-8 min-w-0 rounded border border-border bg-surface px-2 text-xs text-ink-primary outline-none focus:border-emerald-500 sm:w-48"
              :disabled="hasActiveImport"
              @input="onCardUrlInput(row.card.id, $event)"
            />
            <AppButton
              :data-testid="`discord-import-url-${row.card.id}`"
              size="sm"
              class="w-full sm:w-auto"
              :disabled="hasActiveImport || !(cardUrlDrafts[row.card.id] || '').trim()"
              @click="importCardUrl(row)"
            >接收链接</AppButton>
            <AppButton
              :data-testid="`discord-import-${row.card.id}`"
              size="sm"
              class="w-full sm:w-auto"
              :disabled="hasActiveImport"
              @click="chooseCardFile(row)"
            >浏览器接收卡体</AppButton>
            <AppButton
              :data-testid="`discord-skip-${row.card.id}`"
              size="sm"
              variant="ghost"
              class="w-full sm:w-auto"
              :disabled="hasActiveImport"
              @click="failRequestedImport(row)"
            >跳过此项</AppButton>
          </template>
          <AppButton
            v-else-if="row.item.status === 'imported' && row.item.importedAvatar"
            :data-testid="`discord-open-${row.card.id}`"
            size="sm"
            variant="secondary"
            class="w-full sm:w-auto"
            @click="$router.push(`/character/${encodeURIComponent(row.item.importedAvatar || '')}`)"
          >查看角色</AppButton>
          <span v-else-if="row.card.resource.availability === 'unsupported'" class="text-center text-xs text-ink-muted sm:text-right">不可导入</span>
        </div>
      </article>
    </div>
  </section>
</template>
