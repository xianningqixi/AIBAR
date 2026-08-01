import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/api/types'
import { selectRecentMessages } from './buildPayload'

describe('selectRecentMessages', () => {
  it('keeps at most the newest 120 messages in chronological order', () => {
    const messages: ChatMessage[] = Array.from({ length: 125 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `message-${index}`,
    }))

    const selected = selectRecentMessages(messages, 100_000)

    expect(selected).toHaveLength(120)
    expect(selected[0].content).toBe('message-5')
    expect(selected[selected.length - 1]?.content).toBe('message-124')
  })

  it('trims an oversized newest message instead of returning an empty history', () => {
    const selected = selectRecentMessages([
      { role: 'user', content: 'prefix-keep-this-tail' },
    ], 9)

    expect(selected).toEqual([{ role: 'user', content: 'this-tail' }])
  })

  it('stops before adding an older message that exceeds the budget', () => {
    const selected = selectRecentMessages([
      { role: 'user', content: 'older' },
      { role: 'assistant', content: 'newer' },
    ], 22)

    expect(selected).toEqual([{ role: 'assistant', content: 'newer' }])
  })
})
