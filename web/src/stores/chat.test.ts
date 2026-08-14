import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Character, ModelProfile } from '@/api/types'

vi.mock('@/api/chats', () => ({
  fetchChat: vi.fn(),
  saveChat: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('@/api/generate', () => ({
  generateReply: vi.fn(),
  generateReplyStream: vi.fn(),
}))
vi.mock('@/api/settings', () => ({
  loadAibarSettings: vi.fn().mockResolvedValue({}),
  saveAibarSettings: vi.fn().mockResolvedValue(undefined),
  invalidateSettingsCache: vi.fn(),
}))
vi.mock('@/lib/worldInfoMatch', () => ({
  getMatchedWorldInfo: vi.fn().mockResolvedValue(''),
  clearWorldInfoCache: vi.fn(),
}))

import { fetchChat, saveChat } from '@/api/chats'
import { generateReplyStream } from '@/api/generate'
import { useChatStore } from './chat'
import { useModelProfilesStore } from './modelProfiles'
import { useModsStore } from './mods'

const character: Character = {
  name: '测试角色',
  avatar: 'test.png',
  data: { name: '测试角色', description: 'desc', first_mes: '你好' },
} as Character

const profile: ModelProfile = {
  id: 'p1',
  name: '测试模型',
  source: 'openai',
  model: 'm1',
  endpoint: 'https://example.com/v1',
  temperature: 0.7,
  maxTokens: 1024,
  topP: 1,
  presencePenalty: 0,
  frequencyPenalty: 0,
  enabled: true,
} as ModelProfile

function streamOf(events: Array<{ content?: string; reasoning?: string }>) {
  return async function* () {
    for (const evt of events) yield evt
  }
}

function failingStream(message: string) {
  return async function* () {
    // 静态上 yield 可达以同时满足 require-yield 与 no-unreachable
    if (message) throw new Error(message)
    yield { content: '' }
  }
}

/** 先吐出部分内容，然后一直挂起直到调用方 abort（模拟用户点停止） */
function streamUntilAbort(events: Array<{ content?: string }>) {
  return vi.fn().mockImplementation(async function* (_payload: unknown, signal: AbortSignal) {
    for (const evt of events) yield evt
    await new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
      })
    })
  })
}

async function loadReadyChat(chat: ReturnType<typeof useChatStore>) {
  await chat.loadChat(character)
  expect(chat.ready).toBe(true)
}

describe('chat store', () => {
  let chat: ReturnType<typeof useChatStore>

  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.mocked(fetchChat).mockReset().mockResolvedValue({ messages: [], metadata: {}, serverHeader: undefined })
    vi.mocked(saveChat).mockClear()
    vi.mocked(generateReplyStream).mockReset()

    const models = useModelProfilesStore()
    models.profiles.push({ ...profile })
    models.activeProfileId = profile.id
    useModsStore().loaded = true

    chat = useChatStore()
    await loadReadyChat(chat)
  })

  it('sendMessage commits the streamed assistant reply with swipe metadata', async () => {
    vi.mocked(generateReplyStream).mockImplementation(streamOf([
      { content: '你好，' },
      { content: '旅行者。' },
    ]))

    const accepted = await chat.sendMessage('打招呼')
    expect(accepted).toBe(true)
    expect(chat.messages).toHaveLength(2)
    expect(chat.messages[0]).toMatchObject({ role: 'user', content: '打招呼' })
    expect(chat.messages[1]).toMatchObject({
      role: 'assistant',
      content: '你好，旅行者。',
      swipes: ['你好，旅行者。'],
      swipe_id: 0,
    })
    expect(chat.streaming.active).toBe(false)
    expect(chat.streamingContent).toBe('')
    expect(saveChat).toHaveBeenCalled()
  })

  it('keeps partial content with an interruption marker when the user stops mid-stream', async () => {
    vi.mocked(generateReplyStream).mockImplementation(streamUntilAbort([{ content: '说到一半' }]))

    const pending = chat.sendMessage('讲个故事')
    // 等首段内容进入流式缓冲后停止
    await vi.waitFor(() => expect(chat.streamingContent).toBe('说到一半'))
    chat.stopGeneration()
    await pending

    expect(chat.streaming.active).toBe(false)
    expect(chat.messages[chat.messages.length - 1]).toMatchObject({
      role: 'assistant',
      content: '说到一半\n\n[中断]',
    })
  })

  it('restores the previous swipe when regeneration fails with no partial content', async () => {
    vi.mocked(generateReplyStream).mockImplementation(streamOf([{ content: '第一版' }]))
    await chat.sendMessage('你好')
    expect(chat.messages[chat.messages.length - 1]?.content).toBe('第一版')

    vi.mocked(generateReplyStream).mockImplementation(failingStream('上游 500'))
    await chat.regenerateLast()

    const last = chat.messages[chat.messages.length - 1]
    expect(last?.role).toBe('assistant')
    expect(last?.content).toBe('第一版')
    expect(last?.swipes).toEqual(['第一版'])
  })

  it('accumulates swipes across successful regenerations', async () => {
    vi.mocked(generateReplyStream).mockImplementation(streamOf([{ content: '版本A' }]))
    await chat.sendMessage('你好')

    vi.mocked(generateReplyStream).mockImplementation(streamOf([{ content: '版本B' }]))
    await chat.regenerateLast()

    const last = chat.messages[chat.messages.length - 1]
    expect(last?.content).toBe('版本B')
    expect(last?.swipes).toEqual(['版本A', '版本B'])
    expect(last?.swipe_id).toBe(1)
  })

  it('does not commit anything when the stream fails on a fresh reply', async () => {
    vi.mocked(generateReplyStream).mockImplementation(failingStream('连接中断'))
    await chat.sendMessage('你好')
    // 用户消息保留，但没有 assistant 回复
    expect(chat.messages).toHaveLength(1)
    expect(chat.messages[0].role).toBe('user')
    expect(chat.streaming.active).toBe(false)
  })

  it('ignores a late-finishing request after the chat was reset', async () => {
    vi.mocked(generateReplyStream).mockImplementation(streamUntilAbort([{ content: '旧聊天内容' }]))
    const pending = chat.sendMessage('你好')
    await vi.waitFor(() => expect(chat.streamingContent).toBe('旧聊天内容'))

    // 模拟切换到另一个聊天：reset 会 abort 并推进 epoch
    chat.reset()
    await pending

    // 新聊天（空状态）不应被旧请求的残留内容污染
    expect(chat.messages).toEqual([])
    expect(chat.streaming.active).toBe(false)
    expect(chat.streamingContent).toBe('')
  })

  it('rejects sendMessage while streaming and blocks message edits', async () => {
    vi.mocked(generateReplyStream).mockImplementation(streamUntilAbort([{ content: '生成中' }]))
    const pending = chat.sendMessage('第一条')
    await vi.waitFor(() => expect(chat.streaming.active).toBe(true))

    expect(await chat.sendMessage('第二条')).toBe(false)
    expect(chat.messages.filter((m) => m.role === 'user')).toHaveLength(1)

    await chat.editMessage(0, '被改写')
    expect(chat.messages[0].content).toBe('第一条')

    chat.stopGeneration()
    await pending
  })

  it('applySwipe switches between stored swipe variants', async () => {
    vi.mocked(generateReplyStream).mockImplementation(streamOf([{ content: 'A' }]))
    await chat.sendMessage('你好')
    vi.mocked(generateReplyStream).mockImplementation(streamOf([{ content: 'B' }]))
    await chat.regenerateLast()

    await chat.applySwipe(1, -1)
    expect(chat.messages[1].content).toBe('A')
    expect(chat.messages[1].swipe_id).toBe(0)
    await chat.applySwipe(1, 1)
    expect(chat.messages[1].content).toBe('B')
    // 到头后不再越界
    await chat.applySwipe(1, 1)
    expect(chat.messages[1].content).toBe('B')
  })
})
