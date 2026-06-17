import { saveStory } from '@/api/stories'
import type { Character, StoryCard } from '@/api/types'

function compact(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized
}

export function characterGreetings(character: Character | null | undefined): string[] {
  if (!character) return []
  const greetings: string[] = []
  const first = character.data?.first_mes?.trim()
  if (first) greetings.push(first)

  for (const greeting of character.data?.alternate_greetings || []) {
    const text = greeting.trim()
    if (text) greetings.push(text)
  }

  return greetings
}

export function buildStoryFromCharacterGreeting(
  character: Character,
  greeting: string,
  index = 0,
): Partial<StoryCard> {
  const data = character.data
  const scenario = (data?.scenario || character.scenario || '').trim()
  const description = (data?.description || character.description || '').trim()
  const tags = character.tags?.length ? character.tags : data?.tags || []
  const title = `${character.name} - ${index === 0 ? '默认开局' : `开局 ${index + 1}`}`

  return {
    title,
    summary: compact(description || scenario || greeting, 160),
    characterAvatar: character.avatar,
    tags,
    world: data?.world || '',
    scenario,
    openingUserMessage: '',
    openingAssistantMessage: greeting.trim(),
    systemAppend: '',
    modIds: [],
  }
}

export async function saveStoryFromCharacterGreeting(
  character: Character,
  greeting: string,
  index = 0,
): Promise<StoryCard> {
  if (!greeting.trim()) {
    throw new Error('这个角色卡没有可用开场白')
  }
  return saveStory(buildStoryFromCharacterGreeting(character, greeting, index))
}
