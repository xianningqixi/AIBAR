import { describe, expect, it } from 'vitest'
import type { Character } from '@/api/types'
import { analyzeCharacterRuntime } from './characterRuntime'

function character(data: Character['data']): Character {
  return { name: data?.name || 'Test', avatar: 'test.png', data }
}

describe('analyzeCharacterRuntime', () => {
  it('keeps ordinary text cards in the AIBAR runtime', () => {
    const result = analyzeCharacterRuntime(character({
      name: '普通角色',
      description: '普通文本描述',
      first_mes: '你好，{{user}}。',
    }))

    expect(result.runtime).toBe('aibar')
    expect(result.capabilities).toEqual([])
  })

  it('keeps cards with a basic embedded world book in the AIBAR runtime', () => {
    const result = analyzeCharacterRuntime(character({
      name: '港口向导',
      character_book: {
        entries: [{
          keys: ['港口'],
          content: '港口会在午夜关闭。',
          enabled: true,
          extensions: { probability: 100, useProbability: true, depth: 4, position: 0 },
        }],
      },
    }))

    expect(result.runtime).toBe('aibar')
    expect(result.worldBookEntries).toBe(1)
  })

  it('routes cards with depth-injected world-book entries to ST', () => {
    const result = analyzeCharacterRuntime(character({
      name: '状态卡',
      character_book: {
        entries: [{
          keys: ['状态'],
          content: '运行时状态',
          extensions: { position: 4, depth: 2 },
        }],
      },
    }))

    expect(result.runtime).toBe('st-compat')
    expect(result.capabilities).toContainEqual({
      id: 'world-book',
      label: '高级内嵌世界书',
      count: 1,
    })
  })

  it('routes executable Tavern Card V3 features to ST compatibility mode', () => {
    const result = analyzeCharacterRuntime(character({
      name: '复杂角色',
      first_mes: '<iframe srcdoc="<button>开始</button>"></iframe>',
      character_book: { entries: [{ content: 'state' }, { content: 'rules' }] },
      extensions: {
        regex_scripts: [{ script_name: 'render' }],
        tavern_helper: {
          scripts: [{ name: 'MVU', content: "import('https://example.invalid/runtime.js')" }],
        },
        depth_prompt: { prompt: 'state', depth: 4, role: 'system' },
      },
    }))

    expect(result.runtime).toBe('st-compat')
    expect(result.worldBookEntries).toBe(2)
    expect(result.regexScripts).toBe(1)
    expect(result.helperScripts).toBe(1)
    expect(result.usesRemoteCode).toBe(true)
    expect(result.capabilities.map(item => item.id)).toEqual(expect.arrayContaining([
      'world-book',
      'regex',
      'tavern-helper',
      'depth-prompt',
      'interactive-html',
      'mvu',
    ]))
  })
})
