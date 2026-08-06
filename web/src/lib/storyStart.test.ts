import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveChat } from '@/api/chats'
import { setCharacterChat } from '@/api/characters'
import type { Character, StoryCard } from '@/api/types'
import { createChatFromCharacter, createChatFromStory } from './storyStart'

vi.mock('@/api/chats', () => ({
  saveChat: vi.fn(),
}))

vi.mock('@/api/characters', () => ({
  setCharacterChat: vi.fn(),
}))

const character: Character = {
  name: '林月',
  avatar: 'lin-yue.png',
  data: {
    name: '林月',
    first_mes: '欢迎来到雾城。',
    alternate_greetings: ['你终于来了。'],
  },
}

describe('chat start persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-06T04:05:06.000Z'))
  })

  it('seeds a character chat with its opening message and frozen player identity', async () => {
    const fileName = await createChatFromCharacter(character, {
      persona: { id: 'persona-1', name: '  周舟  ', description: '  雾城调查员  ' },
      profileId: 'shared-model',
    })

    expect(fileName).toBe('林月 - 20260806040506')
    expect(saveChat).toHaveBeenCalledWith(
      '林月',
      fileName,
      'lin-yue.png',
      [{ role: 'assistant', content: '欢迎来到雾城。', date: '2026-08-06T04:05:06.000Z' }],
      expect.objectContaining({
        aibar: expect.objectContaining({
          profileId: 'shared-model',
          greetingIndex: 0,
          persona: { id: 'persona-1', name: '周舟', description: '雾城调查员' },
        }),
      }),
    )
    expect(setCharacterChat).toHaveBeenCalledWith('lin-yue.png', fileName)
  })

  it('persists the selected alternate greeting', async () => {
    await createChatFromCharacter(character, {
      greeting: '你终于来了。',
      greetingIndex: 1,
    })

    expect(vi.mocked(saveChat).mock.calls[0]?.[3]).toEqual([
      { role: 'assistant', content: '你终于来了。', date: '2026-08-06T04:05:06.000Z' },
    ])
    expect(vi.mocked(saveChat).mock.calls[0]?.[4]).toEqual(expect.objectContaining({
      aibar: expect.objectContaining({ greetingIndex: 1 }),
    }))
  })

  it('keeps chats without a configured greeting empty', async () => {
    await createChatFromCharacter({ name: '无名', avatar: 'empty.png' })

    expect(vi.mocked(saveChat).mock.calls[0]?.[3]).toEqual([])
  })

  it('stores a player identity snapshot on story starts', async () => {
    const story: StoryCard = {
      id: 'story-1',
      title: '雾城序章',
      characterAvatar: character.avatar,
      openingAssistantMessage: '雨还没有停。',
    }

    await createChatFromStory(story, character, {
      persona: { id: '', name: '周舟', description: '调查员' },
    })

    expect(vi.mocked(saveChat).mock.calls[0]?.[4]).toEqual(expect.objectContaining({
      aibar: expect.objectContaining({
        sourceStoryId: 'story-1',
        persona: { id: '', name: '周舟', description: '调查员' },
      }),
    }))
  })
})
