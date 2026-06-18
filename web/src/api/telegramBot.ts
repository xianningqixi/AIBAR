export const DEFAULT_TELEGRAM_BOT_ADMIN_URL = 'http://127.0.0.1:8787'
export const TELEGRAM_BOT_ADMIN_URL_KEY = 'aibar-telegram-bot-admin-url'
export const TELEGRAM_BOT_ADMIN_TOKEN_KEY = 'aibar-telegram-bot-admin-token'

export interface TelegramBotInfo {
  id: number
  username: string
  firstName: string
  canJoinGroups: boolean
  canReadAllGroupMessages: boolean
  supportsInlineQueries: boolean
}

export interface TelegramBotStatus {
  ok: boolean
  config: {
    tokenConfigured: boolean
    tokenPreview: string
    allowedUserIds: string[]
    stBaseUrl: string
    modelProfileId: string
    maxCompletionTokens: number
    pollTimeoutSeconds: number
    dataDir: string
    admin: {
      host: string
      port: number
      tokenConfigured: boolean
    }
  }
  polling: {
    configured: boolean
    desired: boolean
    running: boolean
    startedAt: string
    stoppedAt: string
    lastUpdateAt: string
    lastError: string
    bot: TelegramBotInfo | null
    offset: number
    sessions: number
    activeUsers: number
  }
}

export interface TelegramBotConfigInput {
  token?: string
  clearToken?: boolean
  allowedUserIds?: string
  stBaseUrl?: string
  modelProfileId?: string
  maxCompletionTokens?: number
  pollTimeoutSeconds?: number
}

export interface TelegramDebugResult {
  ok: boolean
  message: string
  latencyMs: number
  bot?: TelegramBotInfo
}

export interface StDebugResult {
  ok: boolean
  message: string
  latencyMs: number
  stBaseUrl: string
  characters?: number
  modelProfiles?: number
  activeProfileId?: string
}

export interface FullDebugResult {
  ok: boolean
  telegram: TelegramDebugResult
  st: StDebugResult
}

interface AdminRequestOptions {
  baseUrl: string
  adminToken?: string
}

export function normalizeTelegramBotAdminUrl(value: string): string {
  return (value || DEFAULT_TELEGRAM_BOT_ADMIN_URL).trim().replace(/\/+$/, '')
}

export function getStoredTelegramBotAdminUrl(): string {
  return normalizeTelegramBotAdminUrl(localStorage.getItem(TELEGRAM_BOT_ADMIN_URL_KEY) || DEFAULT_TELEGRAM_BOT_ADMIN_URL)
}

async function adminRequest<T>(
  options: AdminRequestOptions,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.adminToken ? { 'X-AIBAR-Admin-Token': options.adminToken } : {}),
  }
  const response = await fetch(`${normalizeTelegramBotAdminUrl(options.baseUrl)}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers || {}),
    },
  })
  const text = await response.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!response.ok) {
    throw new Error(data?.message || `Telegram Bot Admin ${response.status}`)
  }
  return data as T
}

export function getTelegramBotStatus(options: AdminRequestOptions): Promise<TelegramBotStatus> {
  return adminRequest<TelegramBotStatus>(options, '/api/status')
}

export function saveTelegramBotConfig(
  options: AdminRequestOptions,
  input: TelegramBotConfigInput,
): Promise<TelegramBotStatus> {
  return adminRequest<TelegramBotStatus>(options, '/api/config', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function restartTelegramBotPolling(options: AdminRequestOptions): Promise<TelegramBotStatus> {
  return adminRequest<TelegramBotStatus>(options, '/api/polling/restart', {
    method: 'POST',
    body: '{}',
  })
}

export function debugTelegramBot(
  options: AdminRequestOptions,
  input: { token?: string } = {},
): Promise<TelegramDebugResult> {
  return adminRequest<TelegramDebugResult>(options, '/api/debug/telegram', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function debugTelegramSt(
  options: AdminRequestOptions,
  input: { stBaseUrl?: string } = {},
): Promise<StDebugResult> {
  return adminRequest<StDebugResult>(options, '/api/debug/st', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function debugTelegramFull(
  options: AdminRequestOptions,
  input: { token?: string; stBaseUrl?: string } = {},
): Promise<FullDebugResult> {
  return adminRequest<FullDebugResult>(options, '/api/debug/full', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
