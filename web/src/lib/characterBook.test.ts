import { describe, expect, it } from 'vitest'
import type { Character } from '@/api/types'
import { analyzeCharacterBook } from './characterBook'

function characterWithEntries(entries: Array<Record<string, unknown>>): Character {
  return {
    name: 'Book card',
    avatar: 'book.png',
    data: {
      name: 'Book card',
      character_book: { entries },
    },
  }
}

describe('analyzeCharacterBook', () => {
  it('normalizes Tavern Card V3 entries for the native AIBAR matcher', () => {
    const result = analyzeCharacterBook(characterWithEntries([{
      id: 7,
      keys: ['alpha'],
      secondary_keys: ['beta'],
      insertion_order: 42,
      enabled: false,
      content: 'lore',
      extensions: {
        probability: 100,
        useProbability: true,
        depth: 4,
        position: 0,
        selectiveLogic: 3,
      },
    }]))

    expect(result.requiresCompatibility).toBe(false)
    expect(result.entries).toEqual([
      expect.objectContaining({
        uid: 7,
        key: ['alpha'],
        keysecondary: ['beta'],
        order: 42,
        disable: true,
        selectiveLogic: 3,
      }),
    ])
  })

  it('requires ST for world-book behavior the native matcher cannot preserve', () => {
    const result = analyzeCharacterBook(characterWithEntries([
      { extensions: { probability: 35, useProbability: true } },
      { extensions: { group: 'exclusive' } },
      { extensions: { position: 4, depth: 2 } },
    ]))

    expect(result.requiresCompatibility).toBe(true)
    expect(result.reasons).toEqual(expect.arrayContaining([
      'probability',
      'grouping',
      'depth-injection',
    ]))
  })
})
