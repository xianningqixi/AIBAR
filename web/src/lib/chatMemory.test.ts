import { describe, expect, it } from 'vitest'
import {
  MEMORY_REFRESH_MESSAGE_INTERVAL,
  MEMORY_SUMMARY_MAX_CHARS,
  MEMORY_TRANSCRIPT_MAX_CHARS,
  buildMemoryPromptMessages,
  formatMemoryTranscript,
  normalizeMemoryReply,
  shouldRefreshMemory,
  trimMemoryTranscript,
} from './chatMemory'
import type { ChatMessage } from '@/api/types'

const msg = (role: ChatMessage['role'], content: string): ChatMessage => ({ role, content })

describe('formatMemoryTranscript', () => {
  it('labels roles and skips empty messages', () => {
    const out = formatMemoryTranscript(
      [msg('user', 'hi'), msg('assistant', 'hello'), msg('system', 'sys'), msg('user', '  ')],
      '玩家',
      '角色',
    )
    expect(out).toBe('1. 玩家：hi\n\n2. 角色：hello\n\n3. 系统：sys')
  })
})

describe('trimMemoryTranscript', () => {
  it('keeps short transcripts and truncates long ones from the front', () => {
    expect(trimMemoryTranscript('short')).toBe('short')
    const long = 'x'.repeat(MEMORY_TRANSCRIPT_MAX_CHARS + 10)
    const trimmed = trimMemoryTranscript(long)
    expect(trimmed).toContain('早前内容已由旧记忆承接')
    expect(trimmed.length).toBeLessThan(long.length + 100)
  })
})

describe('normalizeMemoryReply', () => {
  it('strips code fences, treats 无/暂无 as empty, and caps the length', () => {
    expect(normalizeMemoryReply('```md\nsummary\n```')).toBe('summary')
    expect(normalizeMemoryReply('无')).toBe('')
    expect(normalizeMemoryReply('暂无')).toBe('')
    const long = 'y'.repeat(MEMORY_SUMMARY_MAX_CHARS + 100)
    expect(normalizeMemoryReply(long).length).toBeLessThanOrEqual(MEMORY_SUMMARY_MAX_CHARS + 3)
  })
})

describe('shouldRefreshMemory', () => {
  const history = (count: number) => Array.from({ length: count + 1 }, (_, i) => msg('user', `m${i}`))

  it('waits for enough history, refreshes immediately on first summary, then every interval', () => {
    expect(shouldRefreshMemory(history(1), 0)).toBe(false)
    expect(shouldRefreshMemory(history(2), 0)).toBe(true)
    expect(shouldRefreshMemory(history(5), 3)).toBe(false)
    expect(shouldRefreshMemory(history(3 + MEMORY_REFRESH_MESSAGE_INTERVAL), 3)).toBe(true)
  })
})

describe('buildMemoryPromptMessages', () => {
  it('embeds the previous memory and transcript into the user prompt', () => {
    const [system, user] = buildMemoryPromptMessages('old memory', 'the transcript')
    expect(system.role).toBe('system')
    expect(user.content).toContain('旧记忆：\nold memory')
    expect(user.content).toContain('历史对话：\nthe transcript')
    expect(buildMemoryPromptMessages('', 't')[1].content).toContain('旧记忆：\n无')
  })
})
