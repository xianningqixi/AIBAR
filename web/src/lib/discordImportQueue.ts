import {
  clearLegacyDiscordImportQueue,
  DISCORD_IMPORT_CHANNEL_ID,
  DISCORD_IMPORT_GUILD_ID,
  getDiscordImportQueueStorageKey,
} from './accountStorage'

export {
  clearLegacyDiscordImportQueue,
  DISCORD_IMPORT_CHANNEL_ID,
  DISCORD_IMPORT_GUILD_ID,
  getDiscordImportQueueStorageKey,
} from './accountStorage'

export const DISCORD_IMPORT_MANIFEST_VERSION = 1 as const
export const DISCORD_IMPORT_TIMEZONE = 'Asia/Shanghai'

export type DiscordImportPeriod = 'today' | 'previous-day' | 'rolling-24h'
export type DiscordImportSort = 'reactions' | 'activity'
export type DiscordImportTagMatch = 'any' | 'all'
export type DiscordCardResourceAvailability = 'ready' | 'browser' | 'unsupported'
export type DiscordCardResourceKind = 'character-card' | 'web-app'
export type DiscordWebAppRuntime = 'standalone' | 'aibar-bridge'
export type DiscordWebAppPermission = 'generation' | 'storage'
export type DiscordImportQueueStatus = 'ready' | 'importing' | 'imported' | 'unsupported' | 'failed'
export type DiscordImportQueueItemStatus = DiscordImportQueueStatus

export interface DiscordCardResource {
  availability: DiscordCardResourceAvailability
  kind: DiscordCardResourceKind
  fileName?: string
  note?: string
  launchUrl?: string
  runtime?: DiscordWebAppRuntime
  bridgeVersion?: 1
  permissions?: DiscordWebAppPermission[]
}

export interface DiscordImportCard {
  id: string
  threadId: string
  title: string
  authorName: string
  sourceUrl: string
  previewUrl?: string
  tags: string[]
  publishedAt?: string
  lastActiveAt?: string
  reactionCount: number
  replyCount: number
  resource: DiscordCardResource
}

export interface DiscordImportManifest {
  version: typeof DISCORD_IMPORT_MANIFEST_VERSION
  guildId: typeof DISCORD_IMPORT_GUILD_ID
  channelId: typeof DISCORD_IMPORT_CHANNEL_ID
  channelName: string
  syncedAt: string
  timezone: typeof DISCORD_IMPORT_TIMEZONE
  period: DiscordImportPeriod
  sort: DiscordImportSort
  filters: {
    tags: string[]
    tagMatch: DiscordImportTagMatch
  }
  cards: DiscordImportCard[]
}

export interface DiscordImportQueueItem {
  id: string
  status: DiscordImportQueueItemStatus
  selected: boolean
  error?: string
  importedAvatar?: string
}

export interface DiscordImportRequest {
  requestedAt: string
  cardIds: string[]
}

export interface DiscordImportQueue {
  version: typeof DISCORD_IMPORT_MANIFEST_VERSION
  manifest: DiscordImportManifest
  items: DiscordImportQueueItem[]
  importedHashes: string[]
  importRequest?: DiscordImportRequest
  updatedAt: string
}

export interface DiscordImportQueueItemPatch {
  status?: DiscordImportQueueItemStatus
  selected?: boolean
  error?: string
  importedAvatar?: string
  importedHash?: string
}

export class DiscordImportValidationError extends Error {
  readonly path: string

  constructor(path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'DiscordImportValidationError'
    this.path = path
  }
}

const MAX_MANIFEST_JSON_LENGTH = 2_000_000
const MAX_CARDS = 200
const MAX_TAGS_PER_CARD = 16
const MAX_FILTER_TAGS = 64
const MAX_IMPORTED_HASHES = 2_000
const MAX_COUNT = 1_000_000_000
const MAX_SOURCE_URL_LENGTH = 2_048
const MAX_PREVIEW_URL_LENGTH = 4_096
const MAX_WEB_APP_URL_LENGTH = 2_048
const MIN_DISCORD_DATE = Date.parse('2015-01-01T00:00:00.000Z')
const MAX_SAFE_DATE = Date.parse('2100-01-01T00:00:00.000Z')
const SNOWFLAKE_PATTERN = /^[1-9]\d{16,19}$/
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/
const HASH_PATTERN = /^[A-Za-z0-9:_-]+$/
const QUEUE_STATUSES = new Set<DiscordImportQueueItemStatus>([
  'ready',
  'importing',
  'imported',
  'unsupported',
  'failed',
])
const RESOURCE_AVAILABILITIES = new Set<DiscordCardResourceAvailability>([
  'ready',
  'browser',
  'unsupported',
])
const RESOURCE_KINDS = new Set<DiscordCardResourceKind>(['character-card', 'web-app'])
const WEB_APP_RUNTIMES = new Set<DiscordWebAppRuntime>(['standalone', 'aibar-bridge'])
const WEB_APP_PERMISSIONS = new Set<DiscordWebAppPermission>(['generation', 'storage'])
const SUPPORTED_CARD_EXTENSIONS = new Set(['png', 'json', 'yaml', 'yml', 'charx', 'byaf'])
const PERIODS = new Set<DiscordImportPeriod>(['today', 'previous-day', 'rolling-24h'])
const SORTS = new Set<DiscordImportSort>(['reactions', 'activity'])
const TAG_MATCHES = new Set<DiscordImportTagMatch>(['any', 'all'])

function validationError(path: string, message: string): never {
  throw new DiscordImportValidationError(path, message)
}

function parseJsonInput(input: unknown, path: string): unknown {
  if (typeof input !== 'string') return input
  if (input.length > MAX_MANIFEST_JSON_LENGTH) validationError(path, 'JSON input is too large')

  try {
    return JSON.parse(input) as unknown
  } catch {
    return validationError(path, 'invalid JSON')
  }
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return validationError(path, 'expected an object')
  }
  return value as Record<string, unknown>
}

function assertExactKeys(record: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed)
  const extra = Object.keys(record).find((key) => !allowedSet.has(key))
  if (extra) validationError(`${path}.${extra}`, 'unexpected field')
}

function asString(
  value: unknown,
  path: string,
  options: { min?: number; max: number; allowEmpty?: boolean },
): string {
  if (typeof value !== 'string') validationError(path, 'expected a string')
  const text = value.trim()
  const min = options.allowEmpty ? 0 : (options.min ?? 1)
  if (text.length < min) validationError(path, 'string is empty')
  if (text.length > options.max) validationError(path, `string exceeds ${options.max} characters`)
  if (/\u0000|[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    validationError(path, 'string contains control characters')
  }
  return text
}

function asOptionalString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  options: { max: number; allowEmpty?: boolean },
): string | undefined {
  if (!(key in record)) return undefined
  return asString(record[key], `${path}.${key}`, options)
}

function asSnowflake(value: unknown, path: string): string {
  const id = asString(value, path, { max: 20 })
  if (!SNOWFLAKE_PATTERN.test(id)) validationError(path, 'expected a Discord snowflake')
  return id
}

function asSafeCount(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > MAX_COUNT) {
    validationError(path, `expected an integer between 0 and ${MAX_COUNT}`)
  }
  return Number(value)
}

function asTimestamp(value: unknown, path: string): string {
  const timestamp = asString(value, path, { max: 40 })
  if (!ISO_TIMESTAMP_PATTERN.test(timestamp)) validationError(path, 'expected an ISO 8601 timestamp with timezone')
  const milliseconds = Date.parse(timestamp)
  if (!Number.isFinite(milliseconds) || milliseconds < MIN_DISCORD_DATE || milliseconds > MAX_SAFE_DATE) {
    validationError(path, 'timestamp is outside the allowed range')
  }
  return timestamp
}

function asOptionalTimestamp(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string | undefined {
  if (!(key in record)) return undefined
  return asTimestamp(record[key], `${path}.${key}`)
}

function asSafeFileName(value: unknown, path: string): string {
  const fileName = asString(value, path, { max: 255 })
  if (fileName === '.' || fileName === '..' || /[/\\]/.test(fileName)) {
    validationError(path, 'expected a plain file name')
  }
  return fileName
}

function hasSafeUrlAuthority(url: URL): boolean {
  return url.protocol === 'https:' && !url.username && !url.password && !url.port
}

export function isDiscordSourceUrl(value: string, threadId?: string, cardId?: string): boolean {
  if (!value || value.length > MAX_SOURCE_URL_LENGTH) return false

  try {
    const url = new URL(value)
    if (!hasSafeUrlAuthority(url) || url.hostname.toLowerCase() !== 'discord.com') return false
    if (url.search || url.hash) return false

    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length !== 3 && segments.length !== 4) return false
    if (segments[0] !== 'channels' || segments[1] !== DISCORD_IMPORT_GUILD_ID) return false

    const channelRef = segments[2]
    const messageRef = segments[3]
    if (!SNOWFLAKE_PATTERN.test(channelRef)) return false
    if (messageRef && !SNOWFLAKE_PATTERN.test(messageRef)) return false
    if (!threadId) return true

    if (channelRef !== threadId && channelRef !== DISCORD_IMPORT_CHANNEL_ID) return false
    if (channelRef === DISCORD_IMPORT_CHANNEL_ID && !messageRef) return false
    if (messageRef && messageRef !== threadId && (!cardId || messageRef !== cardId)) return false
    return channelRef === threadId || messageRef === threadId
  } catch {
    return false
  }
}

export function isDiscordCdnPreviewUrl(value: string): boolean {
  if (!value || value.length > MAX_PREVIEW_URL_LENGTH) return false

  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (!hasSafeUrlAuthority(url)) return false
    if (host !== 'cdn.discordapp.com' && host !== 'media.discordapp.net') return false
    if (url.hash) return false

    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length < 4 || segments[0] !== 'attachments') return false
    if (!SNOWFLAKE_PATTERN.test(segments[1]) || !SNOWFLAKE_PATTERN.test(segments[2])) return false

    const fileName = decodeURIComponent(segments.slice(3).join('/'))
    if (!fileName || fileName.length > 255 || /[/\\\u0000-\u001f\u007f]/.test(fileName)) return false

    const params = [...url.searchParams.entries()]
    if (params.length > 16) return false
    return params.every(([key, item]) => key.length <= 64 && item.length <= 512)
  } catch {
    return false
  }
}

function isPrivateWebAppHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true

  if (host.includes(':')) {
    return host === '::'
      || host === '::1'
      || host.startsWith('::ffff:')
      || /^(?:fc|fd)/.test(host)
      || /^fe[89ab]/.test(host)
  }

  const ipv4 = host.split('.').map(Number)
  if (ipv4.length !== 4 || ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  return ipv4[0] === 0
    || ipv4[0] === 10
    || ipv4[0] === 127
    || (ipv4[0] === 169 && ipv4[1] === 254)
    || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31)
    || (ipv4[0] === 192 && ipv4[1] === 168)
}

export function isSafeWebAppLaunchUrl(value: string): boolean {
  if (!value || value.length > MAX_WEB_APP_URL_LENGTH) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.port
      && !isPrivateWebAppHostname(url.hostname)
  } catch {
    return false
  }
}

function parseWebAppPermissions(value: unknown, path: string): DiscordWebAppPermission[] {
  if (!Array.isArray(value)) validationError(path, 'expected an array')
  if (value.length > WEB_APP_PERMISSIONS.size) validationError(path, 'array contains too many permissions')
  const seen = new Set<DiscordWebAppPermission>()
  return value.map((permission, index) => {
    if (typeof permission !== 'string' || !WEB_APP_PERMISSIONS.has(permission as DiscordWebAppPermission)) {
      validationError(`${path}[${index}]`, 'unsupported web app permission')
    }
    const parsed = permission as DiscordWebAppPermission
    if (seen.has(parsed)) validationError(`${path}[${index}]`, 'duplicate permission')
    seen.add(parsed)
    return parsed
  })
}

function parseTags(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) validationError(path, 'expected an array')
  if (value.length > MAX_TAGS_PER_CARD) {
    validationError(path, `array exceeds ${MAX_TAGS_PER_CARD} items`)
  }

  const seen = new Set<string>()
  return value.map((tag, index) => {
    const parsed = asString(tag, `${path}[${index}]`, { max: 48 })
    const key = parsed.toLocaleLowerCase('en-US')
    if (seen.has(key)) validationError(`${path}[${index}]`, 'duplicate tag')
    seen.add(key)
    return parsed
  })
}

function parseResource(value: unknown, path: string): DiscordCardResource {
  const record = asRecord(value, path)
  assertExactKeys(record, [
    'availability',
    'kind',
    'fileName',
    'note',
    'launchUrl',
    'runtime',
    'bridgeVersion',
    'permissions',
  ], path)

  if (typeof record.availability !== 'string' || !RESOURCE_AVAILABILITIES.has(record.availability as DiscordCardResourceAvailability)) {
    validationError(`${path}.availability`, 'unsupported resource availability')
  }
  const kind = 'kind' in record
    ? record.kind
    : 'character-card'
  if (typeof kind !== 'string' || !RESOURCE_KINDS.has(kind as DiscordCardResourceKind)) {
    validationError(`${path}.kind`, 'unsupported resource kind')
  }
  const parsedKind = kind as DiscordCardResourceKind

  const fileName = 'fileName' in record
    ? asSafeFileName(record.fileName, `${path}.fileName`)
    : undefined
  if (
    parsedKind === 'character-card'
    &&
    record.availability === 'ready'
    && fileName
    && !SUPPORTED_CARD_EXTENSIONS.has(fileName.split('.').pop()?.toLowerCase() || '')
  ) {
    validationError(`${path}.fileName`, 'ready resources must use a supported character-card extension')
  }
  const note = asOptionalString(record, 'note', path, { max: 500, allowEmpty: true })

  if (parsedKind === 'character-card') {
    for (const field of ['launchUrl', 'runtime', 'bridgeVersion', 'permissions']) {
      if (field in record) validationError(`${path}.${field}`, 'field is only valid for web apps')
    }
    return {
      availability: record.availability as DiscordCardResourceAvailability,
      kind: parsedKind,
      ...(fileName !== undefined ? { fileName } : {}),
      ...(note !== undefined ? { note } : {}),
    }
  }

  if (record.availability !== 'ready') {
    validationError(`${path}.availability`, 'web apps must be ready to launch')
  }
  if (fileName !== undefined) validationError(`${path}.fileName`, 'web apps do not use character-card files')

  const launchUrl = asString(record.launchUrl, `${path}.launchUrl`, { max: MAX_WEB_APP_URL_LENGTH })
  if (!isSafeWebAppLaunchUrl(launchUrl)) {
    validationError(`${path}.launchUrl`, 'expected a public HTTPS URL without credentials or a custom port')
  }
  const runtime = 'runtime' in record ? record.runtime : 'standalone'
  if (typeof runtime !== 'string' || !WEB_APP_RUNTIMES.has(runtime as DiscordWebAppRuntime)) {
    validationError(`${path}.runtime`, 'unsupported web app runtime')
  }
  const permissions = 'permissions' in record
    ? parseWebAppPermissions(record.permissions, `${path}.permissions`)
    : []
  if (runtime === 'standalone' && permissions.length) {
    validationError(`${path}.permissions`, 'standalone web apps cannot request AIBAR permissions')
  }
  if (runtime === 'aibar-bridge' && record.bridgeVersion !== 1) {
    validationError(`${path}.bridgeVersion`, 'AIBAR bridge apps require bridgeVersion 1')
  }

  return {
    availability: record.availability as DiscordCardResourceAvailability,
    kind: parsedKind,
    ...(note !== undefined ? { note } : {}),
    launchUrl,
    runtime: runtime as DiscordWebAppRuntime,
    ...(runtime === 'aibar-bridge' ? { bridgeVersion: 1 as const } : {}),
    permissions,
  }
}

export function isDiscordWebAppCard(card: DiscordImportCard): boolean {
  return card.resource.kind === 'web-app'
}

export function isImportableDiscordCharacterCard(card: DiscordImportCard): boolean {
  return card.resource.kind === 'character-card' && card.resource.availability !== 'unsupported'
}

function parseCard(value: unknown, index: number): DiscordImportCard {
  const path = `manifest.cards[${index}]`
  const record = asRecord(value, path)
  assertExactKeys(record, [
    'id',
    'threadId',
    'title',
    'authorName',
    'sourceUrl',
    'previewUrl',
    'tags',
    'publishedAt',
    'lastActiveAt',
    'reactionCount',
    'replyCount',
    'resource',
  ], path)

  const id = asSnowflake(record.id, `${path}.id`)
  const threadId = asSnowflake(record.threadId, `${path}.threadId`)
  const sourceUrl = asString(record.sourceUrl, `${path}.sourceUrl`, { max: MAX_SOURCE_URL_LENGTH })
  if (!isDiscordSourceUrl(sourceUrl, threadId, id)) {
    validationError(`${path}.sourceUrl`, 'URL does not identify this Discord guild thread or card')
  }

  const previewUrl = asOptionalString(record, 'previewUrl', path, { max: MAX_PREVIEW_URL_LENGTH })
  if (previewUrl && !isDiscordCdnPreviewUrl(previewUrl)) {
    validationError(`${path}.previewUrl`, 'expected a Discord CDN attachment URL')
  }
  const publishedAt = asOptionalTimestamp(record, 'publishedAt', path)
  const lastActiveAt = asOptionalTimestamp(record, 'lastActiveAt', path)

  return {
    id,
    threadId,
    title: asString(record.title, `${path}.title`, { max: 240 }),
    authorName: asString(record.authorName, `${path}.authorName`, { max: 120 }),
    sourceUrl,
    ...(previewUrl !== undefined ? { previewUrl } : {}),
    tags: parseTags(record.tags, `${path}.tags`),
    ...(publishedAt !== undefined ? { publishedAt } : {}),
    ...(lastActiveAt !== undefined ? { lastActiveAt } : {}),
    reactionCount: asSafeCount(record.reactionCount, `${path}.reactionCount`),
    replyCount: asSafeCount(record.replyCount, `${path}.replyCount`),
    resource: parseResource(record.resource, `${path}.resource`),
  }
}

function parseFilters(value: unknown): DiscordImportManifest['filters'] {
  if (value === undefined) return { tags: [], tagMatch: 'any' }
  const record = asRecord(value, 'manifest.filters')
  assertExactKeys(record, ['tags', 'tagMatch'], 'manifest.filters')
  if (!Array.isArray(record.tags) || record.tags.length > MAX_FILTER_TAGS) {
    validationError('manifest.filters.tags', `expected an array with at most ${MAX_FILTER_TAGS} items`)
  }
  if (typeof record.tagMatch !== 'string' || !TAG_MATCHES.has(record.tagMatch as DiscordImportTagMatch)) {
    validationError('manifest.filters.tagMatch', 'expected any or all')
  }
  const tags = record.tags.map((tag, index) => (
    asString(tag, `manifest.filters.tags[${index}]`, { max: 48 })
  ))
  const normalizedTags = tags.map((tag) => tag.toLocaleLowerCase('en-US'))
  if (new Set(normalizedTags).size !== tags.length) {
    validationError('manifest.filters.tags', 'contains duplicate tags')
  }
  return { tags, tagMatch: record.tagMatch as DiscordImportTagMatch }
}

export function parseDiscordImportManifest(input: unknown): DiscordImportManifest {
  const record = asRecord(parseJsonInput(input, 'manifest'), 'manifest')
  assertExactKeys(record, [
    'version',
    'guildId',
    'channelId',
    'channelName',
    'syncedAt',
    'timezone',
    'period',
    'sort',
    'filters',
    'cards',
  ], 'manifest')

  if (record.version !== DISCORD_IMPORT_MANIFEST_VERSION) {
    validationError('manifest.version', `expected ${DISCORD_IMPORT_MANIFEST_VERSION}`)
  }
  if (record.guildId !== DISCORD_IMPORT_GUILD_ID) {
    validationError('manifest.guildId', `expected ${DISCORD_IMPORT_GUILD_ID}`)
  }
  if (record.channelId !== DISCORD_IMPORT_CHANNEL_ID) {
    validationError('manifest.channelId', `expected ${DISCORD_IMPORT_CHANNEL_ID}`)
  }
  if (record.timezone !== DISCORD_IMPORT_TIMEZONE) {
    validationError('manifest.timezone', `expected ${DISCORD_IMPORT_TIMEZONE}`)
  }
  if (typeof record.period !== 'string' || !PERIODS.has(record.period as DiscordImportPeriod)) {
    validationError('manifest.period', 'unsupported period')
  }
  if (typeof record.sort !== 'string' || !SORTS.has(record.sort as DiscordImportSort)) {
    validationError('manifest.sort', 'unsupported sort')
  }
  if (!Array.isArray(record.cards)) validationError('manifest.cards', 'expected an array')
  if (record.cards.length > MAX_CARDS) validationError('manifest.cards', `array exceeds ${MAX_CARDS} items`)

  const filters = parseFilters(record.filters)
  const filterTags = filters.tags.map((tag) => tag.toLocaleLowerCase('en-US'))
  const cards = record.cards.map(parseCard)
  const seen = new Set<string>()
  cards.forEach((card, index) => {
    if (seen.has(card.id)) validationError(`manifest.cards[${index}].id`, 'duplicate card id')
    seen.add(card.id)
    if (filterTags.length) {
      const cardTags = new Set(card.tags.map((tag) => tag.toLocaleLowerCase('en-US')))
      const matches = filters.tagMatch === 'all'
        ? filterTags.every((tag) => cardTags.has(tag))
        : filterTags.some((tag) => cardTags.has(tag))
      if (!matches) validationError(`manifest.cards[${index}].tags`, 'does not satisfy manifest filters')
    }
  })

  return {
    version: DISCORD_IMPORT_MANIFEST_VERSION,
    guildId: DISCORD_IMPORT_GUILD_ID,
    channelId: DISCORD_IMPORT_CHANNEL_ID,
    channelName: asString(record.channelName, 'manifest.channelName', { max: 120 }),
    syncedAt: asTimestamp(record.syncedAt, 'manifest.syncedAt'),
    timezone: DISCORD_IMPORT_TIMEZONE,
    period: record.period as DiscordImportPeriod,
    sort: record.sort as DiscordImportSort,
    filters,
    cards,
  }
}

function defaultStatus(card: DiscordImportCard): DiscordImportQueueItemStatus {
  return card.resource.availability === 'unsupported' ? 'unsupported' : 'ready'
}

function createQueueItem(card: DiscordImportCard): DiscordImportQueueItem {
  return {
    id: card.id,
    status: defaultStatus(card),
    selected: false,
  }
}

function parseQueueItem(value: unknown, index: number): DiscordImportQueueItem {
  const path = `queue.items[${index}]`
  const record = asRecord(value, path)
  assertExactKeys(record, ['id', 'status', 'selected', 'error', 'importedAvatar'], path)

  const id = asSnowflake(record.id, `${path}.id`)
  if (typeof record.status !== 'string' || !QUEUE_STATUSES.has(record.status as DiscordImportQueueItemStatus)) {
    validationError(`${path}.status`, 'unsupported queue status')
  }
  if (typeof record.selected !== 'boolean') validationError(`${path}.selected`, 'expected a boolean')

  const error = asOptionalString(record, 'error', path, { max: 1_000, allowEmpty: true })
  const importedAvatar = 'importedAvatar' in record
    ? asSafeFileName(record.importedAvatar, `${path}.importedAvatar`)
    : undefined

  return {
    id,
    status: record.status as DiscordImportQueueItemStatus,
    selected: record.selected,
    ...(error !== undefined ? { error } : {}),
    ...(importedAvatar !== undefined ? { importedAvatar } : {}),
  }
}

function parseImportedHashes(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) validationError(path, 'expected an array')
  if (value.length > MAX_IMPORTED_HASHES) {
    validationError(path, `array exceeds ${MAX_IMPORTED_HASHES} items`)
  }

  const seen = new Set<string>()
  return value.map((hash, index) => {
    const parsed = asString(hash, `${path}[${index}]`, { max: 128 })
    if (!HASH_PATTERN.test(parsed)) validationError(`${path}[${index}]`, 'invalid hash')
    if (seen.has(parsed)) validationError(`${path}[${index}]`, 'duplicate hash')
    seen.add(parsed)
    return parsed
  })
}

function parseImportRequest(
  value: unknown,
  path: string,
  cardById: Map<string, DiscordImportCard>,
): DiscordImportRequest {
  const record = asRecord(value, path)
  assertExactKeys(record, ['requestedAt', 'cardIds'], path)
  if (!Array.isArray(record.cardIds)) validationError(`${path}.cardIds`, 'expected an array')
  if (record.cardIds.length === 0) validationError(`${path}.cardIds`, 'array is empty')
  if (record.cardIds.length > MAX_CARDS) validationError(`${path}.cardIds`, `array exceeds ${MAX_CARDS} items`)

  const seen = new Set<string>()
  const cardIds = record.cardIds.map((value, index) => {
    const id = asSnowflake(value, `${path}.cardIds[${index}]`)
    if (seen.has(id)) validationError(`${path}.cardIds[${index}]`, 'duplicate card id')
    const card = cardById.get(id)
    if (!card) validationError(`${path}.cardIds[${index}]`, 'card is missing from the manifest')
    if (!isImportableDiscordCharacterCard(card)) {
      validationError(`${path}.cardIds[${index}]`, 'resource is not an importable character card')
    }
    seen.add(id)
    return id
  })

  return {
    requestedAt: asTimestamp(record.requestedAt, `${path}.requestedAt`),
    cardIds,
  }
}

function parseQueue(input: unknown, resetImporting: boolean): DiscordImportQueue {
  const record = asRecord(parseJsonInput(input, 'queue'), 'queue')
  assertExactKeys(record, ['version', 'manifest', 'items', 'importedHashes', 'importRequest', 'updatedAt'], 'queue')
  if (record.version !== DISCORD_IMPORT_MANIFEST_VERSION) {
    validationError('queue.version', `expected ${DISCORD_IMPORT_MANIFEST_VERSION}`)
  }

  const manifest = parseDiscordImportManifest(record.manifest)
  if (!Array.isArray(record.items)) validationError('queue.items', 'expected an array')
  if (record.items.length > MAX_CARDS) validationError('queue.items', `array exceeds ${MAX_CARDS} items`)

  const cardById = new Map(manifest.cards.map((card) => [card.id, card]))
  const seen = new Set<string>()
  const parsedItems = record.items.map(parseQueueItem).map((item, index) => {
    if (seen.has(item.id)) validationError(`queue.items[${index}].id`, 'duplicate queue item id')
    seen.add(item.id)
    const card = cardById.get(item.id)
    if (!card) validationError(`queue.items[${index}].id`, 'queue item is missing from the manifest')

    if (!isImportableDiscordCharacterCard(card)) {
      return {
        id: item.id,
        status: defaultStatus(card),
        selected: false,
      }
    }
    if (!resetImporting || item.status !== 'importing') return item
    return {
      id: item.id,
      status: defaultStatus(card),
      selected: item.selected,
    }
  })
  const itemById = new Map(parsedItems.map((item) => [item.id, item]))
  const items = manifest.cards.map((card) => itemById.get(card.id) || createQueueItem(card))
  const resolvedItemById = new Map(items.map((item) => [item.id, item]))
  const parsedImportRequest = 'importRequest' in record
    ? parseImportRequest(record.importRequest, 'queue.importRequest', cardById)
    : undefined
  const importRequest = resetImporting && parsedImportRequest
    ? {
        ...parsedImportRequest,
        cardIds: parsedImportRequest.cardIds.filter((id) => {
          const card = cardById.get(id)
          const item = resolvedItemById.get(id)
          return Boolean(
            card
            && item?.selected
            && isImportableDiscordCharacterCard(card)
            && item.status !== 'imported'
            && item.status !== 'unsupported'
            && item.status !== 'failed',
          )
        }),
      }
    : parsedImportRequest

  return {
    version: DISCORD_IMPORT_MANIFEST_VERSION,
    manifest,
    items,
    importedHashes: parseImportedHashes(record.importedHashes, 'queue.importedHashes'),
    ...(importRequest?.cardIds.length ? { importRequest } : {}),
    updatedAt: asTimestamp(record.updatedAt, 'queue.updatedAt'),
  }
}

function resolveStorage(storage: Storage | null | undefined): Storage | null {
  if (storage !== undefined) return storage
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function loadDiscordImportQueue(
  handle: string,
  storage?: Storage | null,
): DiscordImportQueue | null {
  const target = resolveStorage(storage)
  if (!target) return null

  try {
    const storageKey = getDiscordImportQueueStorageKey(handle)
    const raw = target.getItem(storageKey)
    clearLegacyDiscordImportQueue(target)
    return raw ? parseQueue(raw, true) : null
  } catch {
    return null
  }
}
