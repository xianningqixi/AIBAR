import { describe, expect, it } from 'vitest'
import type { WorldInfoEntry } from '@/api/types'
import { renderMatchedWorldInfo } from './worldInfoMatch'

function entry(overrides: Partial<WorldInfoEntry>): WorldInfoEntry {
  return {
    key: ['primary'],
    content: 'matched',
    ...overrides,
  }
}

describe('renderMatchedWorldInfo', () => {
  it('implements all four secondary-key logic modes', () => {
    const scan = 'primary alpha'
    const entries = [
      entry({ content: 'and-any', keysecondary: ['alpha', 'beta'], selectiveLogic: 0 }),
      entry({ content: 'not-all', keysecondary: ['alpha', 'beta'], selectiveLogic: 1 }),
      entry({ content: 'not-any', keysecondary: ['beta', 'gamma'], selectiveLogic: 2 }),
      entry({ content: 'and-all', keysecondary: ['primary', 'alpha'], selectiveLogic: 3 }),
      entry({ content: 'blocked-not-any', keysecondary: ['alpha'], selectiveLogic: 2 }),
      entry({ content: 'blocked-and-all', keysecondary: ['alpha', 'beta'], selectiveLogic: 3 }),
    ]

    expect(renderMatchedWorldInfo(entries, scan, 10_000).split('\n\n')).toEqual([
      'and-any',
      'not-all',
      'not-any',
      'and-all',
    ])
  })

  it('sorts by descending order and lets ignoreBudget entries bypass the budget', () => {
    const entries = [
      entry({ content: 'low', order: 1 }),
      entry({ content: 'highest', order: 30 }),
      entry({ content: 'too-large', order: 20 }),
      entry({ content: 'always-include', order: 10, ignoreBudget: true }),
    ]

    expect(renderMatchedWorldInfo(entries, 'primary', 8)).toBe('highest\n\nalways-include')
  })
})
