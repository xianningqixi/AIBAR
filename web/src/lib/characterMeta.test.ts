import { describe, expect, it } from 'vitest'
import type { Character, StoryCard } from '../api/types'
import { characterCover, getCharacterDescription, getCharacterTags, storyThumbnail } from './characterMeta'

function char(partial: Partial<Character>): Character {
  return { name: 'C', avatar: 'a.png', ...partial } as Character
}

describe('getCharacterTags', () => {
  it('prefers top-level tags, falls back to data.tags', () => {
    expect(getCharacterTags(char({ tags: ['x'] }))).toEqual(['x'])
    expect(getCharacterTags(char({ data: { name: 'C', tags: ['y'] } }))).toEqual(['y'])
    expect(getCharacterTags(char({}))).toEqual([])
  })
})

describe('getCharacterDescription', () => {
  it('prefers top-level description, falls back to data.description', () => {
    expect(getCharacterDescription(char({ description: 'd1' }))).toBe('d1')
    expect(getCharacterDescription(char({ data: { name: 'C', description: 'd2' } }))).toBe('d2')
    expect(getCharacterDescription(char({}))).toBe('')
  })
})

describe('characterCover', () => {
  it('builds a thumbnail URL with encoded avatar', () => {
    expect(characterCover('a b.png')).toBe('/thumbnail?type=avatar&file=a%20b.png')
  })

  it('returns empty for missing or placeholder avatars', () => {
    expect(characterCover('')).toBe('')
    expect(characterCover('none')).toBe('')
    expect(characterCover(undefined)).toBe('')
  })
})

describe('storyThumbnail', () => {
  const story = { id: 's1', title: 't', characterAvatar: 'a.png' } as StoryCard

  it('prefers the story cover image', () => {
    expect(storyThumbnail({ ...story, coverImage: '/x.png' })).toBe('/x.png')
  })

  it('falls back to the linked character cover', () => {
    expect(storyThumbnail(story, char({ avatar: 'a.png' }))).toContain('a.png')
    expect(storyThumbnail(story, undefined)).toBe('')
  })
})
