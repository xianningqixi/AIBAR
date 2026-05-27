import { saveChat } from '@/api/chats'
import { setCharacterChat } from '@/api/characters'
import type { Character, ChatMessage, StoryCard } from '@/api/types'
import { normalizeText } from './format'

function safeFileBase(value: string, fallback: string): string {
  return normalizeText(value)
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || fallback
}

export function createStoryChatName(story: StoryCard): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/[.TZ]/g, '').slice(0, 14)
  return `${safeFileBase(story.title, 'AIBAR Story')} - ${stamp}`
}

export async function createChatFromStory(
  story: StoryCard,
  character: Character,
): Promise<string> {
  const now = new Date().toISOString()
  const fileName = createStoryChatName(story)
  const messages: ChatMessage[] = []

  if (story.openingUserMessage?.trim()) {
    messages.push({
      role: 'user',
      content: story.openingUserMessage.trim(),
      date: now,
    })
  }

  if (story.openingAssistantMessage?.trim()) {
    messages.push({
      role: 'assistant',
      content: story.openingAssistantMessage.trim(),
      date: now,
    })
  }

  await saveChat(character.name, fileName, character.avatar, messages, {
    simple_ui: true,
    aibar: {
      kind: 'chat_session',
      sourceStoryId: story.id,
      storyTitle: story.title,
      storySummary: story.summary || '',
      storyScenario: story.scenario || '',
      storySystemAppend: story.systemAppend || '',
      profileId: story.modelProfileId || '',
      world: story.world || '',
      mods: story.modIds || [],
      createdAt: now,
    },
  })
  await setCharacterChat(character.avatar, fileName)

  return fileName
}

export function createCharacterChatName(character: Character): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/[.TZ]/g, '').slice(0, 14)
  return `${safeFileBase(character.name, 'AIBAR Chat')} - ${stamp}`
}

export async function createChatFromCharacter(
  character: Character,
  options: {
    modIds?: string[]
    profileId?: string
    world?: string
  } = {},
): Promise<string> {
  const now = new Date().toISOString()
  const fileName = createCharacterChatName(character)
  await saveChat(character.name, fileName, character.avatar, [], {
    simple_ui: true,
    aibar: {
      kind: 'chat_session',
      profileId: options.profileId || '',
      world: options.world || '',
      mods: options.modIds || [],
      createdAt: now,
    },
  })
  await setCharacterChat(character.avatar, fileName)

  return fileName
}
