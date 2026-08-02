import { describe, expect, it } from 'vitest'
import {
  createDiscordImportQueue,
  DISCORD_IMPORT_CHANNEL_ID,
  DISCORD_IMPORT_GUILD_ID,
  DISCORD_IMPORT_MANIFEST_VERSION,
  DISCORD_IMPORT_TIMEZONE,
  isSafeWebAppLaunchUrl,
  parseDiscordImportManifest,
  requestDiscordImportBatch,
  resolveDiscordImportBatchItem,
  updateDiscordImportQueueItem,
} from './discordImportQueue'

const readyId = '1478612237869519022'
const unsupportedId = '1478612237869519023'
const webAppId = '1478612237869519024'
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
  it('keeps legacy character-card manifests importable and clears completed work', () => {
    const now = new Date(timestamp)
    let queue = createDiscordImportQueue(manifest, now)
    expect(queue.manifest.cards[0].resource.kind).toBe('character-card')
    queue = updateDiscordImportQueueItem(queue, readyId, { selected: true }, now)
    expect(() => updateDiscordImportQueueItem(queue, unsupportedId, { selected: true }, now)).toThrow(
      'resource is not an importable character card',
    )
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

  it('accepts web apps but never selects or submits them as character cards', () => {
    const parsed = parseDiscordImportManifest({
      ...manifest,
      cards: [
        ...manifest.cards,
        {
          id: webAppId,
          threadId: webAppId,
          title: 'Standalone app',
          authorName: 'AppAuthor',
          sourceUrl: `https://discord.com/channels/${DISCORD_IMPORT_GUILD_ID}/${webAppId}`,
          tags: ['web'],
          reactionCount: 5,
          replyCount: 1,
          resource: {
            availability: 'ready',
            kind: 'web-app',
            launchUrl: 'https://fc-example.com/app',
            runtime: 'standalone',
            permissions: [],
          },
        },
      ],
    })
    let queue = createDiscordImportQueue(parsed, new Date(timestamp))
    expect(queue.items.find((item) => item.id === webAppId)).toMatchObject({ status: 'ready', selected: false })
    expect(() => updateDiscordImportQueueItem(queue, webAppId, { selected: true })).toThrow(
      'resource is not an importable character card',
    )

    queue = updateDiscordImportQueueItem(queue, readyId, { selected: true }, new Date(timestamp))
    queue = requestDiscordImportBatch(queue, new Date(timestamp))
    expect(queue.importRequest?.cardIds).toEqual([readyId])
  })

  it('only accepts public HTTPS launch URLs without credentials or custom ports', () => {
    expect(isSafeWebAppLaunchUrl('https://fc-example.com/app')).toBe(true)
    expect(isSafeWebAppLaunchUrl('https://fd-tools.example/app')).toBe(true)
    expect(isSafeWebAppLaunchUrl('http://example.com/app')).toBe(false)
    expect(isSafeWebAppLaunchUrl('https://user:secret@example.com/app')).toBe(false)
    expect(isSafeWebAppLaunchUrl('https://example.com:8443/app')).toBe(false)
    expect(isSafeWebAppLaunchUrl('https://localhost./app')).toBe(false)
    expect(isSafeWebAppLaunchUrl('https://127.0.0.1/app')).toBe(false)
    expect(isSafeWebAppLaunchUrl('https://[::1]/app')).toBe(false)
    expect(isSafeWebAppLaunchUrl('https://[fc00::1]/app')).toBe(false)
    expect(isSafeWebAppLaunchUrl('https://[fe9a::1]/app')).toBe(false)
    expect(isSafeWebAppLaunchUrl('https://[::ffff:127.0.0.1]/app')).toBe(false)
  })
})
