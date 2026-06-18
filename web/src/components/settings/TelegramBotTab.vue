<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useUiStore } from '@/stores/ui'
import {
  DEFAULT_TELEGRAM_BOT_ADMIN_URL,
  TELEGRAM_BOT_ADMIN_TOKEN_KEY,
  TELEGRAM_BOT_ADMIN_URL_KEY,
  debugTelegramBot,
  debugTelegramFull,
  debugTelegramSt,
  getTelegramBotStatus,
  normalizeTelegramBotAdminUrl,
  restartTelegramBotPolling,
  saveTelegramBotConfig,
  type FullDebugResult,
  type StDebugResult,
  type TelegramBotStatus,
  type TelegramDebugResult,
} from '@/api/telegramBot'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'

type DebugResult = TelegramDebugResult | StDebugResult | FullDebugResult

const ui = useUiStore()
const models = useModelProfilesStore()

const serviceUrl = useLocalStorage(TELEGRAM_BOT_ADMIN_URL_KEY, DEFAULT_TELEGRAM_BOT_ADMIN_URL)
const adminToken = useLocalStorage(TELEGRAM_BOT_ADMIN_TOKEN_KEY, '')

const status = ref<TelegramBotStatus | null>(null)
const loadingStatus = ref(false)
const saving = ref(false)
const restarting = ref(false)
const debugRunning = ref('')
const debugResult = ref<{ title: string; data: DebugResult } | null>(null)

const tokenDraft = ref('')
const allowedUserIds = ref('')
const stBaseUrl = ref('http://127.0.0.1:8001')
const modelProfileId = ref('')
const maxCompletionTokens = ref('4096')
const pollTimeoutSeconds = ref('25')

const adminOptions = computed(() => ({
  baseUrl: normalizeTelegramBotAdminUrl(serviceUrl.value),
  adminToken: adminToken.value.trim() || undefined,
}))

const currentBotName = computed(() => {
  const bot = status.value?.polling.bot
  if (!bot) return '未连接'
  return bot.username ? `@${bot.username}` : bot.firstName || String(bot.id)
})

const pollingLabel = computed(() => {
  if (!status.value) return '服务未连接'
  if (!status.value.config.tokenConfigured) return '待配置 Token'
  return status.value.polling.running ? '轮询中' : '未运行'
})

const pollingToneClass = computed(() => {
  if (!status.value) return 'bg-ink-primary/5 text-ink-muted ring-border-subtle'
  if (status.value.polling.running) return 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25'
  if (status.value.config.tokenConfigured) return 'bg-amber-500/10 text-amber-300 ring-amber-500/25'
  return 'bg-ink-primary/5 text-ink-muted ring-border-subtle'
})

function hydrateFromStatus(next: TelegramBotStatus) {
  allowedUserIds.value = next.config.allowedUserIds.join(', ')
  stBaseUrl.value = next.config.stBaseUrl || stBaseUrl.value
  modelProfileId.value = next.config.modelProfileId || ''
  maxCompletionTokens.value = String(next.config.maxCompletionTokens || 4096)
  pollTimeoutSeconds.value = String(next.config.pollTimeoutSeconds || 25)
}

async function refreshStatus(showToast = false) {
  loadingStatus.value = true
  try {
    serviceUrl.value = normalizeTelegramBotAdminUrl(serviceUrl.value)
    const next = await getTelegramBotStatus(adminOptions.value)
    status.value = next
    hydrateFromStatus(next)
    if (showToast) ui.addToast('Telegram Bot 状态已刷新', 'success')
  } catch (error) {
    status.value = null
    if (showToast) ui.addToast(`无法连接 Telegram Bot 服务：${errorMessage(error)}`, 'error')
  } finally {
    loadingStatus.value = false
  }
}

async function saveConfig() {
  saving.value = true
  try {
    serviceUrl.value = normalizeTelegramBotAdminUrl(serviceUrl.value)
    const next = await saveTelegramBotConfig(adminOptions.value, {
      ...(tokenDraft.value.trim() ? { token: tokenDraft.value.trim() } : {}),
      allowedUserIds: allowedUserIds.value,
      stBaseUrl: stBaseUrl.value,
      modelProfileId: modelProfileId.value,
      maxCompletionTokens: Number(maxCompletionTokens.value) || 4096,
      pollTimeoutSeconds: Number(pollTimeoutSeconds.value) || 25,
    })
    status.value = next
    tokenDraft.value = ''
    hydrateFromStatus(next)
    ui.addToast('Telegram Bot 配置已保存', 'success')
  } catch (error) {
    ui.addToast(`保存失败：${errorMessage(error)}`, 'error')
  } finally {
    saving.value = false
  }
}

async function restartPolling() {
  restarting.value = true
  try {
    const next = await restartTelegramBotPolling(adminOptions.value)
    status.value = next
    hydrateFromStatus(next)
    ui.addToast(next.polling.running ? '轮询已重启' : '轮询未启动，请检查 Token', next.polling.running ? 'success' : 'warning')
  } catch (error) {
    ui.addToast(`重启失败：${errorMessage(error)}`, 'error')
  } finally {
    restarting.value = false
  }
}

async function runDebug(kind: 'telegram' | 'st' | 'full') {
  debugRunning.value = kind
  debugResult.value = null
  try {
    if (kind === 'telegram') {
      const data = await debugTelegramBot(adminOptions.value, {
        ...(tokenDraft.value.trim() ? { token: tokenDraft.value.trim() } : {}),
      })
      debugResult.value = { title: 'Telegram Token 检查', data }
      ui.addToast(data.ok ? data.message : `Telegram 检查失败：${data.message}`, data.ok ? 'success' : 'error')
      return
    }
    if (kind === 'st') {
      const data = await debugTelegramSt(adminOptions.value, { stBaseUrl: stBaseUrl.value })
      debugResult.value = { title: 'ST 后端检查', data }
      ui.addToast(data.ok ? data.message : `ST 检查失败：${data.message}`, data.ok ? 'success' : 'error')
      return
    }
    const data = await debugTelegramFull(adminOptions.value, {
      ...(tokenDraft.value.trim() ? { token: tokenDraft.value.trim() } : {}),
      stBaseUrl: stBaseUrl.value,
    })
    debugResult.value = { title: '完整诊断', data }
    ui.addToast(data.ok ? '完整诊断通过' : '完整诊断存在失败项', data.ok ? 'success' : 'warning')
  } catch (error) {
    ui.addToast(`诊断失败：${errorMessage(error)}`, 'error')
  } finally {
    debugRunning.value = ''
  }
}

function isDebugOk(data: DebugResult): boolean {
  return Boolean(data.ok)
}

function formatDebug(data: DebugResult): string {
  return JSON.stringify(data, null, 2)
}

function formatTime(value?: string): string {
  if (!value) return '无'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

onMounted(() => {
  void refreshStatus(false)
})
</script>

<template>
  <div class="space-y-4">
    <AppCard padding="md" tone="glow" class="space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs uppercase tracking-[0.18em] text-brand-300 font-semibold">Telegram Bot</p>
          <h2 class="mt-2 text-xl font-semibold text-ink-primary">本地 companion 服务配置</h2>
          <p class="mt-1 text-sm text-ink-secondary max-w-2xl leading-relaxed">
            配置写入独立的 <span class="font-mono text-ink-primary">telegram-bot/.env</span>，聊天数据仍通过 ST API 保存到现有角色聊天。
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span :class="['inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1', pollingToneClass]">
            {{ pollingLabel }}
          </span>
          <AppButton variant="secondary" size="sm" :disabled="loadingStatus" @click="refreshStatus(true)">
            {{ loadingStatus ? '刷新中...' : '刷新状态' }}
          </AppButton>
        </div>
      </div>

      <div class="grid gap-3 md:grid-cols-4">
        <div class="rounded-lg bg-surface-sunken p-3 ring-1 ring-border-subtle">
          <p class="text-[11px] text-ink-muted">Bot</p>
          <p class="mt-1 truncate text-sm font-semibold text-ink-primary">{{ currentBotName }}</p>
        </div>
        <div class="rounded-lg bg-surface-sunken p-3 ring-1 ring-border-subtle">
          <p class="text-[11px] text-ink-muted">Token</p>
          <p class="mt-1 truncate text-sm font-semibold text-ink-primary">
            {{ status?.config.tokenPreview || (status?.config.tokenConfigured ? '已配置' : '未配置') }}
          </p>
        </div>
        <div class="rounded-lg bg-surface-sunken p-3 ring-1 ring-border-subtle">
          <p class="text-[11px] text-ink-muted">会话</p>
          <p class="mt-1 text-sm font-semibold text-ink-primary tabular-nums">
            {{ status?.polling.sessions ?? 0 }} 个
          </p>
        </div>
        <div class="rounded-lg bg-surface-sunken p-3 ring-1 ring-border-subtle">
          <p class="text-[11px] text-ink-muted">最后更新</p>
          <p class="mt-1 truncate text-sm font-semibold text-ink-primary">
            {{ formatTime(status?.polling.lastUpdateAt) }}
          </p>
        </div>
      </div>
    </AppCard>

    <div class="grid gap-4 lg:grid-cols-[1fr_360px]">
      <AppCard padding="md" class="space-y-4">
        <div>
          <h3 class="text-base font-semibold text-ink-primary">连接配置</h3>
          <p class="mt-1 text-sm text-ink-secondary">
            先启动 <span class="font-mono text-ink-primary">telegram-bot</span> 服务，再在这里保存 Token 和白名单。
          </p>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
          <AppFormField label="Bot 服务地址">
            <AppInput v-model="serviceUrl" placeholder="http://127.0.0.1:8787" />
          </AppFormField>
          <AppFormField label="Admin Token" hint="如果服务端配置了 ADMIN_TOKEN，在这里填写；只保存在当前浏览器。">
            <AppInput v-model="adminToken" type="password" placeholder="可选" />
          </AppFormField>
        </div>

        <AppFormField
          label="Telegram Bot Token"
          :hint="status?.config.tokenConfigured ? '留空表示不修改已保存 Token。' : '从 BotFather 获取，保存后只在 bot 服务端落盘。'"
        >
          <AppInput v-model="tokenDraft" type="password" placeholder="123456789:AA..." />
        </AppFormField>

        <div class="grid gap-3 md:grid-cols-2">
          <AppFormField label="允许使用的 Telegram 数字 ID" hint="多个 ID 用英文逗号分隔；为空表示不限制。">
            <AppInput v-model="allowedUserIds" placeholder="123456789,987654321" />
          </AppFormField>
          <AppFormField label="ST 后端地址">
            <AppInput v-model="stBaseUrl" placeholder="http://127.0.0.1:8001" />
          </AppFormField>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
          <AppFormField label="模型 Profile">
            <AppSelect v-model="modelProfileId">
              <option value="">跟随 AIBAR 当前默认</option>
              <option v-for="profile in models.profiles" :key="profile.id" :value="profile.id">
                {{ profile.name }} · {{ profile.model }}
              </option>
            </AppSelect>
          </AppFormField>
          <AppFormField label="TG 单次最大输出 tokens" hint="会限制 profile/preset 的 max_tokens，避免超大值导致模型 Bad Request。">
            <AppInput v-model="maxCompletionTokens" type="number" min="256" max="65536" step="256" />
          </AppFormField>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
          <AppFormField label="轮询超时（秒）" hint="范围 5-60，保存时会自动限制。">
            <AppInput v-model="pollTimeoutSeconds" type="number" min="5" max="60" step="1" />
          </AppFormField>
        </div>

        <div class="flex flex-wrap gap-2 pt-1">
          <AppButton :disabled="saving" @click="saveConfig">
            {{ saving ? '保存中...' : '保存配置' }}
          </AppButton>
          <AppButton variant="secondary" :disabled="restarting" @click="restartPolling">
            {{ restarting ? '重启中...' : '重启轮询' }}
          </AppButton>
        </div>
      </AppCard>

      <AppCard padding="md" class="space-y-4">
        <div>
          <h3 class="text-base font-semibold text-ink-primary">运行状态</h3>
          <p class="mt-1 text-sm text-ink-secondary">
            {{ status ? '服务已响应。' : '服务未响应，请确认本地 bot 服务已启动。' }}
          </p>
        </div>

        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between gap-3 rounded-lg bg-surface-sunken px-3 py-2 ring-1 ring-border-subtle">
            <span class="text-ink-muted">Admin API</span>
            <span class="font-mono text-xs text-ink-primary">{{ status?.config.admin.host || '127.0.0.1' }}:{{ status?.config.admin.port || 8787 }}</span>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-lg bg-surface-sunken px-3 py-2 ring-1 ring-border-subtle">
            <span class="text-ink-muted">白名单</span>
            <span class="text-ink-primary">{{ status?.config.allowedUserIds.length ?? 0 }} 个 ID</span>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-lg bg-surface-sunken px-3 py-2 ring-1 ring-border-subtle">
            <span class="text-ink-muted">Offset</span>
            <span class="font-mono text-xs text-ink-primary">{{ status?.polling.offset ?? 0 }}</span>
          </div>
          <div class="rounded-lg bg-surface-sunken px-3 py-2 ring-1 ring-border-subtle">
            <div class="flex items-center justify-between gap-3">
              <span class="text-ink-muted">最近错误</span>
              <span :class="status?.polling.lastError ? 'text-red-300' : 'text-emerald-300'">
                {{ status?.polling.lastError ? '有' : '无' }}
              </span>
            </div>
            <p v-if="status?.polling.lastError" class="mt-2 break-words text-xs leading-relaxed text-red-200/90">
              {{ status.polling.lastError }}
            </p>
          </div>
        </div>
      </AppCard>
    </div>

    <AppCard padding="md" class="space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="text-base font-semibold text-ink-primary">调试</h3>
          <p class="mt-1 text-sm text-ink-secondary">
            Token 检查会调用 Telegram getMe；ST 检查会读取角色列表和 AIBAR 模型配置。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <AppButton variant="secondary" size="sm" :disabled="!!debugRunning" @click="runDebug('telegram')">
            {{ debugRunning === 'telegram' ? '检查中...' : '检查 Token' }}
          </AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!!debugRunning" @click="runDebug('st')">
            {{ debugRunning === 'st' ? '检查中...' : '检查 ST' }}
          </AppButton>
          <AppButton variant="secondary" size="sm" :disabled="!!debugRunning" @click="runDebug('full')">
            {{ debugRunning === 'full' ? '诊断中...' : '完整诊断' }}
          </AppButton>
        </div>
      </div>

      <div
        v-if="debugResult"
        :class="[
          'rounded-lg p-3 ring-1',
          isDebugOk(debugResult.data)
            ? 'bg-emerald-500/10 ring-emerald-500/25'
            : 'bg-red-500/10 ring-red-500/25',
        ]"
      >
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-semibold text-ink-primary">{{ debugResult.title }}</p>
          <span :class="isDebugOk(debugResult.data) ? 'text-emerald-300' : 'text-red-300'" class="text-xs font-medium">
            {{ isDebugOk(debugResult.data) ? '通过' : '失败' }}
          </span>
        </div>
        <pre class="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/20 p-3 text-xs leading-relaxed text-ink-secondary">{{ formatDebug(debugResult.data) }}</pre>
      </div>
    </AppCard>
  </div>
</template>
