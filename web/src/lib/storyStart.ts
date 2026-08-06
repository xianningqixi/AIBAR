import { saveChat } from '@/api/chats'
import { setCharacterChat } from '@/api/characters'
import type { Character, ChatMessage, ChatPersonaSnapshot, StoryCard } from '@/api/types'
import { normalizeText } from './format'

export interface CharacterChatStartOptions {
  greeting?: string
  greetingIndex?: number
  modIds?: string[]
  persona?: ChatPersonaSnapshot
  profileId?: string
  world?: string
}

function personaSnapshot(persona?: ChatPersonaSnapshot): ChatPersonaSnapshot | undefined {
  if (!persona) return undefined
  return {
    id: persona.id.trim(),
    name: persona.name.trim() || 'User',
    description: persona.description.trim(),
  }
}

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
  options: { persona?: ChatPersonaSnapshot } = {},
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
      persona: personaSnapshot(options.persona),
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
  options: CharacterChatStartOptions = {},
): Promise<string> {
  const now = new Date().toISOString()
  const fileName = createCharacterChatName(character)
  const greeting = (options.greeting ?? character.data?.first_mes ?? '').trim()
  const messages: ChatMessage[] = greeting
    ? [{ role: 'assistant', content: greeting, date: now }]
    : []
  await saveChat(character.name, fileName, character.avatar, messages, {
    simple_ui: true,
    aibar: {
      kind: 'chat_session',
      profileId: options.profileId || '',
      world: options.world || '',
      mods: options.modIds || [],
      persona: personaSnapshot(options.persona),
      greetingIndex: Number.isInteger(options.greetingIndex) ? options.greetingIndex : 0,
      createdAt: now,
    },
  })
  await setCharacterChat(character.avatar, fileName)

  return fileName
}
