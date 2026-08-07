import { describe, expect, it } from 'vitest'
import {
  DISCORD_IMPORT_CHANNEL_ID,
  DISCORD_IMPORT_GUILD_ID,
  DISCORD_IMPORT_MANIFEST_VERSION,
  DISCORD_IMPORT_TIMEZONE,
  isDiscordWebAppCard,
  isSafeWebAppLaunchUrl,
  parseDiscordImportManifest,
} from './discordImportQueue'

// 批次导入流程已迁移到本地 discord-import-service 控制台；
// 前端保留的存活面是 manifest v1 契约解析与 web-app 启动 URL 校验。

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

describe('Discord import manifest contract', () => {
  it('parses legacy character-card manifests with defaults', () => {
    const parsed = parseDiscordImportManifest(manifest)
    expect(parsed.filters).toEqual({ tags: [], tagMatch: 'any' })
    expect(parsed.cards[0].resource.kind).toBe('character-card')
    expect(parsed.cards[1].resource.availability).toBe('unsupported')
  })

  it('accepts T+1 manifests and validates Discord tag filters', () => {
    const filteredManifest = {
      ...manifest,
      period: 'previous-day',
      filters: {
        tags: ['中文', '剧情'],
        tagMatch: 'all',
      },
      cards: manifest.cards.map((card) => ({ ...card, tags: ['中文', '剧情'] })),
    }
    const parsed = parseDiscordImportManifest(filteredManifest)

    expect(parsed.period).toBe('previous-day')
    expect(parsed.filters).toEqual({ tags: ['中文', '剧情'], tagMatch: 'all' })
    expect(() => parseDiscordImportManifest({
      ...manifest,
      filters: { tags: ['原创', '原创'], tagMatch: 'any' },
    })).toThrow('contains duplicate tags')
    expect(() => parseDiscordImportManifest({
      ...manifest,
      filters: { tags: [], tagMatch: 'none' },
    })).toThrow('expected any or all')
    expect(() => parseDiscordImportManifest({
      ...filteredManifest,
      filters: { tags: ['原创'], tagMatch: 'any' },
    })).toThrow('does not satisfy manifest filters')
  })

  it('parses web-app cards and distinguishes them from character cards', () => {
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
    const webAppCard = parsed.cards.find((card) => card.id === webAppId)
    expect(webAppCard).toBeDefined()
    expect(isDiscordWebAppCard(webAppCard!)).toBe(true)
    expect(isDiscordWebAppCard(parsed.cards[0])).toBe(false)
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
