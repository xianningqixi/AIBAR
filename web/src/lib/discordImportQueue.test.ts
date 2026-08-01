import { describe, expect, it } from 'vitest'
import {
  createDiscordImportQueue,
  DISCORD_IMPORT_CHANNEL_ID,
  DISCORD_IMPORT_GUILD_ID,
  DISCORD_IMPORT_MANIFEST_VERSION,
  DISCORD_IMPORT_TIMEZONE,
  requestDiscordImportBatch,
  resolveDiscordImportBatchItem,
  updateDiscordImportQueueItem,
} from './discordImportQueue'

const readyId = '1478612237869519022'
const unsupportedId = '1478612237869519023'
const timestamp = '2026-08-01T00:00:00.000Z'
const manifest = {
  version: DISCORD_IMPORT_MANIFEST_VERSION,
  guildId: DISCORD_IMPORT_GUILD_ID,
  channelId: DISCORD_IMPORT_CHANNEL_ID,
  channelName: 'hot-cards',
  syncedAt: timestamp,
  timezone: DISCORD_IMPORT_TIMEZONE,
  period: 'today',
  sort: 'reactions',
  cards: [
    {
      id: readyId,
      threadId: readyId,
      title: 'Ready card',
      authorName: 'Author',
      sourceUrl: `https://discord.com/channels/${DISCORD_IMPORT_GUILD_ID}/${readyId}`,
      tags: [],
      reactionCount: 10,
      replyCount: 2,
      resource: { availability: 'ready', fileName: 'card.png' },
    },
    {
      id: unsupportedId,
      threadId: unsupportedId,
      title: 'Screenshot only',
      authorName: 'Author',
      sourceUrl: `https://discord.com/channels/${DISCORD_IMPORT_GUILD_ID}/${unsupportedId}`,
      tags: [],
      reactionCount: 1,
      replyCount: 0,
      resource: { availability: 'unsupported', note: 'not a character card' },
    },
  ],
} as const

describe('Discord import queue', () => {
  it('requests only selected supported resources and clears completed work', () => {
    const now = new Date(timestamp)
    let queue = createDiscordImportQueue(manifest, now)
    queue = updateDiscordImportQueueItem(queue, readyId, { selected: true }, now)
    queue = updateDiscordImportQueueItem(queue, unsupportedId, { selected: true }, now)
    queue = requestDiscordImportBatch(queue, now)

    expect(queue.importRequest?.cardIds).toEqual([readyId])

    queue = resolveDiscordImportBatchItem(queue, readyId, {
      status: 'imported',
      importedAvatar: 'ready-card.png',
      importedHash: 'sha256:ready-card',
    }, now)
    expect(queue.importRequest).toBeUndefined()
    expect(queue.items.find((item) => item.id === readyId)).toMatchObject({
      status: 'imported',
      importedAvatar: 'ready-card.png',
    })
    expect(queue.importedHashes).toContain('sha256:ready-card')
  })
})
