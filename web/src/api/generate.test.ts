import { describe, expect, it } from 'vitest'
import { parseStreamChunk } from './generate'

describe('parseStreamChunk', () => {
  it('preserves OpenAI-compatible deltas', () => {
    expect(parseStreamChunk({
      choices: [{ delta: { content: 'hello' } }],
    })).toEqual({ content: 'hello', reasoning: undefined })
  })

  it('extracts Anthropic text and thinking deltas', () => {
    expect(parseStreamChunk({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: '你好' },
    })).toEqual({ content: '你好', reasoning: undefined })

    expect(parseStreamChunk({
      type: 'content_block_delta',
      delta: { type: 'thinking_delta', thinking: '分析中' },
    })).toEqual({ content: undefined, reasoning: '分析中' })
  })
})
