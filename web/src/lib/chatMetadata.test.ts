import { describe, expect, it } from 'vitest'
import {
  applyStoryOverlay,
  getMemoryState,
  getMetadataModIds,
  getMetadataPersona,
  getMetadataProfileId,
  mergeMetadataAibar,
} from './chatMetadata'
import type { Character } from '@/api/types'

describe('mergeMetadataAibar', () => {
  it('merges into the aibar key without mutating the input', () => {
    const original = { aibar: { profileId: 'p1', world: 'w' }, other: 1 }
    const next = mergeMetadataAibar(original, { profileId: 'p2' })
    expect(next).toEqual({ aibar: { profileId: 'p2', world: 'w' }, other: 1 })
    expect(original.aibar.profileId).toBe('p1')
  })

  it('creates the aibar key when metadata is empty', () => {
    expect(mergeMetadataAibar({}, { presetId: 'x' })).toEqual({ aibar: { presetId: 'x' } })
  })
})

describe('metadata getters', () => {
  it('tolerate missing or malformed values', () => {
    expect(getMetadataProfileId({})).toBe('')
    expect(getMetadataProfileId({ aibar: { profileId: 42 } })).toBe('42')
    expect(getMetadataModIds({ aibar: { mods: ['a', 1, 'b'] } })).toEqual(['a', 'b'])
    expect(getMetadataModIds({ aibar: { mods: 'nope' } })).toEqual([])
    expect(getMemoryState({})).toEqual({ summary: '', updatedAt: '', messageCount: 0 })
  })

  it('rejects persona snapshots without a usable name', () => {
    expect(getMetadataPersona({ aibar: { persona: { name: '  ' } } })).toBeNull()
    expect(getMetadataPersona({ aibar: { persona: { name: 'Ash', description: 'd' } } }))
      .toEqual({ id: '', name: 'Ash', description: 'd' })
  })
})

describe('applyStoryOverlay', () => {
  const char: Character = {
    name: 'C',
    avatar: 'c.png',
    scenario: 'base scenario',
    data: { name: 'C', scenario: 'base scenario', system_prompt: 'base sys' },
  } as Character

  it('returns the character untouched when no story fields exist', () => {
    expect(applyStoryOverlay(char, {})).toBe(char)
  })

  it('appends story parts to scenario and system prompt', () => {
    const next = applyStoryOverlay(char, {
      storyTitle: 'T',
      storyScenario: 'S',
      storySystemAppend: 'extra sys',
    })
    expect(next.data?.scenario).toContain('base scenario')
    expect(next.data?.scenario).toContain('故事标题：T')
    expect(next.data?.scenario).toContain('故事场景：S')
    expect(next.data?.system_prompt).toBe('base sys\n\nextra sys')
    expect(char.data?.scenario).toBe('base scenario')
  })
})
