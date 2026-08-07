const TELEGRAM_BOT_ADMIN_TOKEN_KEY = 'aibar-telegram-bot-admin-token'
export const DISCORD_IMPORT_GUILD_ID = '1380075940285124724'
export const DISCORD_IMPORT_CHANNEL_ID = '1478612237869519021'

const LEGACY_DISCORD_IMPORT_QUEUE_STORAGE_KEY =
  `aibar.discord-import.${DISCORD_IMPORT_GUILD_ID}.${DISCORD_IMPORT_CHANNEL_ID}.v1`

function resolveStorage(storage: Storage | null | undefined): Storage | null {
  if (storage !== undefined) return storage
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function getTelegramBotAdminTokenKey(handle: string): string {
  const account = encodeURIComponent(handle.trim() || 'anonymous')
  return `${TELEGRAM_BOT_ADMIN_TOKEN_KEY}.${account}`
}

export function clearLegacyTelegramBotAdminToken(storage?: Storage | null): void {
  try {
    resolveStorage(storage)?.removeItem(TELEGRAM_BOT_ADMIN_TOKEN_KEY)
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}

export function clearStoredTelegramBotAdminToken(
  handle: string,
  storage?: Storage | null,
): void {
  try {
    const target = resolveStorage(storage)
    target?.removeItem(getTelegramBotAdminTokenKey(handle))
    target?.removeItem(TELEGRAM_BOT_ADMIN_TOKEN_KEY)
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}

export function getChatDraftKey(handle: string, avatar: string): string {
  const account = encodeURIComponent(handle.trim() || 'anonymous')
  return `aibar.chat-draft.${account}.${encodeURIComponent(avatar)}`
}

export function getDiscordImportQueueStorageKey(handle: string): string {
  const account = encodeURIComponent(handle.trim() || 'anonymous')
  return `${LEGACY_DISCORD_IMPORT_QUEUE_STORAGE_KEY}.${account}`
}

export function clearLegacyDiscordImportQueue(storage?: Storage | null): boolean {
  const target = resolveStorage(storage)
  if (!target) return false
  try {
    target.removeItem(LEGACY_DISCORD_IMPORT_QUEUE_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
