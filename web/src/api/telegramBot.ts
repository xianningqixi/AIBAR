import { apiPost } from './client'

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
    stUserHandle: string
    stPasswordConfigured: boolean
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
  stUserHandle?: string
  stUserPassword?: string
  clearStUserPassword?: boolean
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
  adminToken?: string
}

function proxyBody(options: AdminRequestOptions, body: object = {}): Record<string, unknown> {
  return {
    ...body,
    ...(options.adminToken ? { adminToken: options.adminToken } : {}),
  }
}

export function getTelegramBotStatus(options: AdminRequestOptions): Promise<TelegramBotStatus> {
  return apiPost<TelegramBotStatus>('/api/aibar/telegram/status', proxyBody(options))
}

export function saveTelegramBotConfig(
  options: AdminRequestOptions,
  input: TelegramBotConfigInput,
): Promise<TelegramBotStatus> {
  return apiPost<TelegramBotStatus>('/api/aibar/telegram/config', proxyBody(options, input))
}

export function restartTelegramBotPolling(options: AdminRequestOptions): Promise<TelegramBotStatus> {
  return apiPost<TelegramBotStatus>('/api/aibar/telegram/polling/restart', proxyBody(options))
}

export function debugTelegramBot(
  options: AdminRequestOptions,
  input: { token?: string } = {},
): Promise<TelegramDebugResult> {
  return apiPost<TelegramDebugResult>('/api/aibar/telegram/debug/telegram', proxyBody(options, input))
}

export function debugTelegramSt(
  options: AdminRequestOptions,
  input: { stUserHandle?: string; stUserPassword?: string } = {},
): Promise<StDebugResult> {
  return apiPost<StDebugResult>('/api/aibar/telegram/debug/st', proxyBody(options, input))
}

export function debugTelegramFull(
  options: AdminRequestOptions,
  input: {
    token?: string
    stUserHandle?: string
    stUserPassword?: string
  } = {},
): Promise<FullDebugResult> {
  return apiPost<FullDebugResult>('/api/aibar/telegram/debug/full', proxyBody(options, input))
}
