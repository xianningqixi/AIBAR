<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { generateReply, generateReplyStream } from '@/api/generate'
import type { Character, ModelProfile } from '@/api/types'
import { buildChatCompletionPayload } from '@/lib/buildPayload'
import {
  isDiscordWebAppCard,
  loadDiscordImportQueue,
  type DiscordImportCard,
  type DiscordWebAppPermission,
} from '@/lib/discordImportQueue'
import {
  WEB_APP_BRIDGE_VERSION,
  WEB_APP_STORAGE_MAX_BYTES,
  getWebAppStorageKey,
  isWebAppBridgeRequestId,
  loadWebAppStorage,
  parseWebAppBridgeRequest,
  parseWebAppGenerationRequest,
  parseWebAppStorageKey,
  parseWebAppStorageSet,
  permissionForWebAppMethod,
  saveWebAppStorage,
  type WebAppBridgeRequest,
} from '@/lib/webAppBridge'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useSessionStore } from '@/stores/session'
import AppButton from '@/components/ui/AppButton.vue'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const models = useModelProfilesStore()

const iframe = ref<HTMLIFrameElement>()
const started = ref(false)
const loading = ref(false)
const frameKey = ref(0)
const bridgeConnected = ref(false)
const bridgeCalls = ref(0)
const pageError = ref('')
let activeGeneration: { requestId: string; controller: AbortController } | null = null
let runtimeEpoch = 0

const cardId = computed(() => String(route.params.cardId || ''))
const accountHandle = computed(() => session.user?.handle || '')
const queue = computed(() => loadDiscordImportQueue(accountHandle.value))
const card = computed<DiscordImportCard | null>(() => {
  const matched = queue.value?.manifest.cards.find((item) => item.id === cardId.value) || null
  return matched && isDiscordWebAppCard(matched) ? matched : null
})
const resource = computed(() => card.value?.resource || null)
const runtime = computed(() => resource.value?.runtime || 'standalone')
const permissions = computed<DiscordWebAppPermission[]>(() => resource.value?.permissions || [])
const launchUrl = computed(() => resource.value?.launchUrl || '')
const launchHost = computed(() => {
  try {
    return new URL(launchUrl.value).hostname
  } catch {
    return ''
  }
})
const storageKey = computed(() => getWebAppStorageKey(accountHandle.value, card.value?.threadId || ''))
const sandbox = computed(() => runtime.value === 'standalone'
  ? 'allow-scripts allow-same-origin allow-forms allow-modals allow-pointer-lock allow-presentation'
  : 'allow-scripts allow-forms allow-modals allow-pointer-lock allow-presentation')
const statusLabel = computed(() => {
  if (!started.value) return '等待授权'
  if (loading.value) return '正在启动'
  if (runtime.value === 'standalone') return '独立运行'
  return bridgeConnected.value ? '已连接 AIBAR' : '等待应用接入'
})

function permissionLabel(permission: DiscordWebAppPermission): string {
  return permission === 'generation' ? '使用当前模型生成' : '保存应用数据'
}

function postToApp(message: Record<string, unknown>) {
  iframe.value?.contentWindow?.postMessage(message, '*')
}

function respond(requestId: string, ok: boolean, result?: unknown, error?: string) {
  postToApp({
    type: 'aibar.web-app.response',
    version: WEB_APP_BRIDGE_VERSION,
    requestId,
    ok,
    ...(ok ? { result } : { error: error || '请求失败' }),
  })
}

function postStream(requestId: string, content?: string, reasoning?: string) {
  postToApp({
    type: 'aibar.web-app.stream',
    version: WEB_APP_BRIDGE_VERSION,
    requestId,
    delta: {
      ...(content ? { content } : {}),
      ...(reasoning ? { reasoning } : {}),
    },
  })
}

function buildAppPayload(request: ReturnType<typeof parseWebAppGenerationRequest>): Record<string, unknown> {
  const active = models.activeProfile
  if (!active.id || active.enabled === false) throw new Error('AIBAR 当前没有可用模型')
  const config: ModelProfile = {
    ...active,
    ...(request.options?.temperature !== undefined ? { temperature: request.options.temperature } : {}),
    ...(request.options?.topP !== undefined ? { topP: request.options.topP } : {}),
    ...(request.options?.maxTokens !== undefined
      ? { maxTokens: Math.min(request.options.maxTokens, Math.max(active.maxTokens, 1)) }
      : {}),
  }
  const character: Character = {
    name: card.value?.title || 'AIBAR Web App',
    avatar: 'none',
  }
  return buildChatCompletionPayload(
    config,
    request.messages,
    character,
    session.user?.name || session.user?.handle || 'User',
  )
}

async function runGeneration(request: WebAppBridgeRequest, stream: boolean) {
  if (activeGeneration) throw new Error('已有模型请求正在运行')
  const parsed = parseWebAppGenerationRequest(request.params)
  await models.load()
  const controller = new AbortController()
  const requestEpoch = runtimeEpoch
  activeGeneration = { requestId: request.requestId, controller }
  try {
    const payload = buildAppPayload(parsed)
    if (!stream) {
      const content = await generateReply(payload, controller.signal)
      if (requestEpoch === runtimeEpoch) respond(request.requestId, true, { content })
      return
    }

    let content = ''
    let reasoning = ''
    for await (const event of generateReplyStream(payload, controller.signal)) {
      if (event.content) content += event.content
      if (event.reasoning) reasoning += event.reasoning
      if (requestEpoch === runtimeEpoch) postStream(request.requestId, event.content, event.reasoning)
    }
    if (requestEpoch === runtimeEpoch) {
      respond(request.requestId, true, {
        content,
        ...(reasoning ? { reasoning } : {}),
      })
    }
  } finally {
    if (activeGeneration?.requestId === request.requestId) activeGeneration = null
  }
}

function requireEmptyParams(value: unknown) {
  if (value === undefined || value === null) return
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) {
    throw new Error('该方法不接受参数')
  }
}

async function handleBridgeRequest(request: WebAppBridgeRequest) {
  if (runtime.value !== 'aibar-bridge') throw new Error('该应用未启用 AIBAR 桥接')
  const requiredPermission = permissionForWebAppMethod(request.method)
  if (requiredPermission && !permissions.value.includes(requiredPermission)) {
    throw new Error(`应用没有 ${permissionLabel(requiredPermission)} 权限`)
  }
  bridgeCalls.value += 1
  if (bridgeCalls.value > 500) throw new Error('本次应用会话的桥接请求过多')

  if (request.method === 'bridge.handshake') {
    requireEmptyParams(request.params)
    bridgeConnected.value = true
    respond(request.requestId, true, {
      bridgeVersion: WEB_APP_BRIDGE_VERSION,
      app: {
        id: card.value?.id,
        title: card.value?.title,
        authorName: card.value?.authorName,
      },
      permissions: permissions.value,
      limits: { storageBytes: WEB_APP_STORAGE_MAX_BYTES },
      modelAvailable: Boolean(models.activeProfile.id && models.activeProfile.enabled !== false),
    })
    return
  }

  if (request.method === 'llm.cancel') {
    requireEmptyParams(request.params)
    const cancelled = Boolean(activeGeneration)
    activeGeneration?.controller.abort()
    respond(request.requestId, true, { cancelled })
    return
  }
  if (request.method === 'llm.generate' || request.method === 'llm.stream') {
    await runGeneration(request, request.method === 'llm.stream')
    return
  }

  const snapshot = loadWebAppStorage(window.localStorage, storageKey.value)
  if (request.method === 'storage.get') {
    const key = parseWebAppStorageKey(request.params)
    respond(request.requestId, true, { value: snapshot.values[key] ?? null })
    return
  }
  if (request.method === 'storage.set') {
    const item = parseWebAppStorageSet(request.params)
    snapshot.values[item.key] = item.value
    saveWebAppStorage(window.localStorage, storageKey.value, snapshot)
    respond(request.requestId, true, { saved: true })
    return
  }
  if (request.method === 'storage.remove') {
    const key = parseWebAppStorageKey(request.params)
    const removed = Object.prototype.hasOwnProperty.call(snapshot.values, key)
    delete snapshot.values[key]
    saveWebAppStorage(window.localStorage, storageKey.value, snapshot)
    respond(request.requestId, true, { removed })
    return
  }
  if (request.method === 'storage.list') {
    requireEmptyParams(request.params)
    respond(request.requestId, true, { keys: Object.keys(snapshot.values).sort() })
    return
  }
  if (request.method === 'storage.clear') {
    requireEmptyParams(request.params)
    saveWebAppStorage(window.localStorage, storageKey.value, { version: WEB_APP_BRIDGE_VERSION, values: {} })
    respond(request.requestId, true, { cleared: true })
  }
}

function onMessage(event: MessageEvent) {
  if (!started.value || event.source !== iframe.value?.contentWindow) return
  let requestId = ''
  try {
    const request = parseWebAppBridgeRequest(event.data)
    if (!request) return
    requestId = request.requestId
    const requestEpoch = runtimeEpoch
    void handleBridgeRequest(request).catch((error: unknown) => {
      if (requestEpoch === runtimeEpoch) {
        respond(request.requestId, false, undefined, error instanceof Error ? error.message : '桥接请求失败')
      }
    })
  } catch (error: unknown) {
    const rawCandidate = event.data && typeof event.data === 'object'
      ? (event.data as Record<string, unknown>).requestId
      : undefined
    const candidate = isWebAppBridgeRequestId(rawCandidate) ? rawCandidate : ''
    requestId = requestId || candidate
    if (requestId) respond(requestId, false, undefined, error instanceof Error ? error.message : '桥接请求无效')
  }
}

async function startApp() {
  if (!card.value || !launchUrl.value) return
  pageError.value = ''
  bridgeConnected.value = false
  bridgeCalls.value = 0
  loading.value = true
  started.value = true
  runtimeEpoch += 1
  frameKey.value += 1
  if (runtime.value === 'aibar-bridge' && permissions.value.includes('generation')) {
    try {
      await models.load()
    } catch (error: unknown) {
      started.value = false
      loading.value = false
      pageError.value = error instanceof Error ? error.message : '模型配置加载失败'
      return
    }
  }
  await nextTick()
}

function onFrameLoad() {
  loading.value = false
  if (runtime.value !== 'aibar-bridge') return
  postToApp({
    type: 'aibar.web-app.ready',
    version: WEB_APP_BRIDGE_VERSION,
    permissions: permissions.value,
  })
}

function reloadApp() {
  if (!started.value) return
  activeGeneration?.controller.abort()
  activeGeneration = null
  runtimeEpoch += 1
  bridgeConnected.value = false
  loading.value = true
  frameKey.value += 1
}

function stopApp() {
  activeGeneration?.controller.abort()
  activeGeneration = null
  runtimeEpoch += 1
  started.value = false
  loading.value = false
  bridgeConnected.value = false
}

function openExternal() {
  if (!launchUrl.value) return
  window.open(launchUrl.value, '_blank', 'noopener,noreferrer')
}

onMounted(() => window.addEventListener('message', onMessage))
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  activeGeneration?.controller.abort()
  activeGeneration = null
  runtimeEpoch += 1
})
</script>

<template>
  <div class="flex min-h-[100dvh] flex-col bg-bg text-ink-primary" data-testid="web-app-page">
    <header class="flex min-h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-5">
      <AppButton variant="ghost" size="sm" title="返回 Discord 公共发布" @click="router.push('/hub?source=discord')">返回</AppButton>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-sm font-semibold sm:text-base">{{ card?.title || '独立网页应用' }}</h1>
        <p v-if="card" class="truncate text-[11px] text-ink-muted">{{ card.authorName }} · {{ launchHost }}</p>
      </div>
      <span v-if="card" data-testid="web-app-status" class="hidden rounded bg-surface-sunken px-2 py-1 text-[11px] text-ink-secondary sm:inline-flex">
        {{ statusLabel }}
      </span>
      <AppButton v-if="started" variant="ghost" size="sm" title="在新标签打开" @click="openExternal">新标签</AppButton>
      <AppButton v-if="started" variant="ghost" size="sm" @click="reloadApp">重新载入</AppButton>
      <AppButton v-if="started" variant="secondary" size="sm" @click="stopApp">停止</AppButton>
    </header>

    <main v-if="!card" class="flex flex-1 items-center justify-center px-5 py-12">
      <div class="w-full max-w-xl rounded-md border border-border bg-surface p-6 text-center">
        <h2 class="text-lg font-semibold">找不到网页应用</h2>
        <p class="mt-2 text-sm text-ink-secondary">该网页应用入口已移至本地 Discord 导入控制台。</p>
        <AppButton class="mt-5" @click="router.push('/hub?source=discord')">返回 Discord 发布</AppButton>
      </div>
    </main>

    <main v-else-if="!started" class="flex flex-1 items-center justify-center px-5 py-10">
      <section class="w-full max-w-2xl rounded-md border border-border bg-surface p-5 sm:p-7" data-testid="web-app-consent">
        <p class="text-xs font-semibold text-emerald-700">第三方网页应用</p>
        <h2 class="mt-2 text-lg font-semibold">确认运行权限</h2>
        <dl class="mt-5 grid gap-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt class="text-ink-muted">来源域名</dt>
          <dd class="min-w-0 break-all font-medium">{{ launchHost }}</dd>
          <dt class="text-ink-muted">运行方式</dt>
          <dd>{{ runtime === 'aibar-bridge' ? 'AIBAR 隔离桥接' : '第三方独立运行' }}</dd>
          <dt class="text-ink-muted">AIBAR 权限</dt>
          <dd v-if="permissions.length" class="flex flex-wrap gap-2">
            <span v-for="permission in permissions" :key="permission" class="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
              {{ permissionLabel(permission) }}
            </span>
          </dd>
          <dd v-else>无</dd>
        </dl>
        <p class="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          {{ runtime === 'aibar-bridge'
            ? '应用在无同源权限的 sandbox 中运行，只能调用上方已授权的桥接方法；AIBAR 不会发送 Cookie 或模型密钥。'
            : '应用与 AIBAR 数据隔离，不会获得 AIBAR 模型、存档或账号信息；第三方页面仍可按自身代码访问外部网络。' }}
        </p>
        <p v-if="pageError" class="mt-3 text-sm text-red-700">{{ pageError }}</p>
        <div class="mt-6 flex flex-wrap justify-end gap-2">
          <AppButton variant="ghost" @click="openExternal">在新标签打开</AppButton>
          <AppButton data-testid="web-app-start" @click="startApp">允许并启动</AppButton>
        </div>
      </section>
    </main>

    <main v-else class="relative min-h-0 flex-1 bg-black" data-testid="web-app-runtime">
      <div v-if="loading" class="absolute inset-0 z-10 flex items-center justify-center bg-surface text-sm text-ink-secondary">
        正在启动应用…
      </div>
      <iframe
        :key="frameKey"
        ref="iframe"
        :src="launchUrl"
        :title="card.title"
        :sandbox="sandbox"
        allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; clipboard-read 'none'; clipboard-write 'none'"
        referrerpolicy="no-referrer"
        class="h-full min-h-[calc(100dvh-3.5rem)] w-full border-0 bg-white"
        data-testid="web-app-frame"
        @load="onFrameLoad"
      />
    </main>
  </div>
</template>
