import type { DiscordWebAppPermission } from './discordImportQueue'

export const WEB_APP_BRIDGE_VERSION = 1 as const
export const WEB_APP_STORAGE_MAX_BYTES = 512 * 1024
const WEB_APP_STORAGE_VALUE_MAX_BYTES = 256 * 1024
const WEB_APP_MESSAGE_MAX_CHARS = 48_000
const WEB_APP_MESSAGES_MAX_CHARS = 160_000
const WEB_APP_MESSAGES_MAX_ITEMS = 120
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/
const STORAGE_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/
const STORAGE_RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export type WebAppBridgeMethod =
  | 'bridge.handshake'
  | 'storage.get'
  | 'storage.set'
  | 'storage.remove'
  | 'storage.list'
  | 'storage.clear'
  | 'llm.generate'
  | 'llm.stream'
  | 'llm.cancel'

export interface WebAppBridgeRequest {
  type: 'aibar.web-app.request'
  version: typeof WEB_APP_BRIDGE_VERSION
  requestId: string
  method: WebAppBridgeMethod
  params?: unknown
}

export interface WebAppBridgeMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface WebAppGenerationRequest {
  messages: WebAppBridgeMessage[]
  options?: {
    temperature?: number
    maxTokens?: number
    topP?: number
  }
}

export interface WebAppStorageSnapshot {
  version: typeof WEB_APP_BRIDGE_VERSION
  values: Record<string, unknown>
}

const BRIDGE_METHODS = new Set<WebAppBridgeMethod>([
  'bridge.handshake',
  'storage.get',
  'storage.set',
  'storage.remove',
  'storage.list',
  'storage.clear',
  'llm.generate',
  'llm.stream',
  'llm.cancel',
])

export function isWebAppBridgeRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value)
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`)
  }
  return value as Record<string, unknown>
}

function assertExactKeys(record: Record<string, unknown>, allowed: readonly string[], label: string) {
  const allowedSet = new Set(allowed)
  const extra = Object.keys(record).find((key) => !allowedSet.has(key))
  if (extra) throw new Error(`${label}.${extra} 不是受支持的字段`)
}

function jsonSize(value: unknown): number {
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new Error('数据必须可以序列化为 JSON')
  }
  if (serialized === undefined) throw new Error('数据必须可以序列化为 JSON')
  return new TextEncoder().encode(serialized).byteLength
}

export function parseWebAppBridgeRequest(value: unknown): WebAppBridgeRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (record.type !== 'aibar.web-app.request') return null
  assertExactKeys(record, ['type', 'version', 'requestId', 'method', 'params'], 'request')
  if (record.version !== WEB_APP_BRIDGE_VERSION) throw new Error('不支持的 AIBAR 应用桥接版本')
  if (!isWebAppBridgeRequestId(record.requestId)) {
    throw new Error('requestId 格式无效')
  }
  if (typeof record.method !== 'string' || !BRIDGE_METHODS.has(record.method as WebAppBridgeMethod)) {
    throw new Error('不支持的桥接方法')
  }
  return {
    type: 'aibar.web-app.request',
    version: WEB_APP_BRIDGE_VERSION,
    requestId: record.requestId,
    method: record.method as WebAppBridgeMethod,
    ...('params' in record ? { params: record.params } : {}),
  }
}

export function permissionForWebAppMethod(method: WebAppBridgeMethod): DiscordWebAppPermission | null {
  if (method.startsWith('storage.')) return 'storage'
  if (method.startsWith('llm.')) return 'generation'
  return null
}

export function parseWebAppGenerationRequest(value: unknown): WebAppGenerationRequest {
  const record = asRecord(value, 'params')
  assertExactKeys(record, ['messages', 'options'], 'params')
  if (!Array.isArray(record.messages) || !record.messages.length) throw new Error('messages 不能为空')
  if (record.messages.length > WEB_APP_MESSAGES_MAX_ITEMS) throw new Error('messages 数量过多')

  let totalChars = 0
  const messages = record.messages.map((item, index): WebAppBridgeMessage => {
    const message = asRecord(item, `messages[${index}]`)
    assertExactKeys(message, ['role', 'content'], `messages[${index}]`)
    if (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant') {
      throw new Error(`messages[${index}].role 无效`)
    }
    if (typeof message.content !== 'string' || !message.content.trim()) {
      throw new Error(`messages[${index}].content 不能为空`)
    }
    if (message.content.length > WEB_APP_MESSAGE_MAX_CHARS) {
      throw new Error(`messages[${index}].content 过长`)
    }
    totalChars += message.content.length
    if (totalChars > WEB_APP_MESSAGES_MAX_CHARS) throw new Error('messages 总长度过长')
    return { role: message.role, content: message.content }
  })

  if (!('options' in record)) return { messages }
  const rawOptions = asRecord(record.options, 'options')
  assertExactKeys(rawOptions, ['temperature', 'maxTokens', 'topP'], 'options')
  const options: NonNullable<WebAppGenerationRequest['options']> = {}
  if ('temperature' in rawOptions) {
    if (!Number.isFinite(rawOptions.temperature) || Number(rawOptions.temperature) < 0 || Number(rawOptions.temperature) > 2) {
      throw new Error('temperature 必须在 0 到 2 之间')
    }
    options.temperature = Number(rawOptions.temperature)
  }
  if ('maxTokens' in rawOptions) {
    if (!Number.isSafeInteger(rawOptions.maxTokens) || Number(rawOptions.maxTokens) < 1 || Number(rawOptions.maxTokens) > 32_768) {
      throw new Error('maxTokens 必须是 1 到 32768 的整数')
    }
    options.maxTokens = Number(rawOptions.maxTokens)
  }
  if ('topP' in rawOptions) {
    if (!Number.isFinite(rawOptions.topP) || Number(rawOptions.topP) < 0 || Number(rawOptions.topP) > 1) {
      throw new Error('topP 必须在 0 到 1 之间')
    }
    options.topP = Number(rawOptions.topP)
  }
  return { messages, options }
}

export function getWebAppStorageKey(handle: string, threadId: string): string {
  return `aibar.web-app.${encodeURIComponent(handle)}.${threadId}.v1`
}

export function parseWebAppStorageKey(value: unknown): string {
  const record = asRecord(value, 'params')
  assertExactKeys(record, ['key'], 'params')
  if (
    typeof record.key !== 'string'
    || !STORAGE_KEY_PATTERN.test(record.key)
    || STORAGE_RESERVED_KEYS.has(record.key)
  ) {
    throw new Error('存档键格式无效或使用了保留名称')
  }
  return record.key
}

export function parseWebAppStorageSet(value: unknown): { key: string; value: unknown } {
  const record = asRecord(value, 'params')
  assertExactKeys(record, ['key', 'value'], 'params')
  const key = parseWebAppStorageKey({ key: record.key })
  if (!('value' in record)) throw new Error('缺少存档值')
  if (jsonSize(record.value) > WEB_APP_STORAGE_VALUE_MAX_BYTES) throw new Error('单项存档不能超过 256 KB')
  return { key, value: record.value }
}

export function loadWebAppStorage(storage: Storage, storageKey: string): WebAppStorageSnapshot {
  try {
    const raw = storage.getItem(storageKey)
    if (!raw) return { version: WEB_APP_BRIDGE_VERSION, values: {} }
    const parsed = JSON.parse(raw) as unknown
    const record = asRecord(parsed, 'storage')
    if (record.version !== WEB_APP_BRIDGE_VERSION) throw new Error('存档版本无效')
    const values = asRecord(record.values, 'storage.values')
    if (jsonSize({ version: WEB_APP_BRIDGE_VERSION, values }) > WEB_APP_STORAGE_MAX_BYTES) {
      throw new Error('应用存档超过容量限制')
    }
    return { version: WEB_APP_BRIDGE_VERSION, values }
  } catch {
    return { version: WEB_APP_BRIDGE_VERSION, values: {} }
  }
}

export function saveWebAppStorage(storage: Storage, storageKey: string, snapshot: WebAppStorageSnapshot) {
  if (jsonSize(snapshot) > WEB_APP_STORAGE_MAX_BYTES) throw new Error('应用存档总量不能超过 512 KB')
  storage.setItem(storageKey, JSON.stringify(snapshot))
}
