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
