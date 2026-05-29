import type { Character, ChatMessage, StoryCard } from '@/api/types'

function joinParts(parts: Array<string | undefined>): string {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ')
}

function stripMarkdown(value: string): string {
  return value
    .replace(/[*_`>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildCharacterImagePrompt(character: Partial<Character> & { name?: string }): string {
  const data = character.data
  const tags = character.tags?.length ? character.tags : data?.tags || []
  return joinParts([
    `character portrait of ${character.name || data?.name || 'the character'}`,
    data?.description || character.description,
    data?.personality || character.personality,
    data?.scenario || character.scenario,
    tags.length ? `tags: ${tags.join(', ')}` : '',
    'single character, expressive face, clean composition',
  ])
}

export function buildStoryImagePrompt(story: Partial<StoryCard>, character?: Character | null): string {
  return joinParts([
    `cover art for story "${story.title || 'untitled story'}"`,
    story.summary,
    story.scenario,
    character ? `main character: ${character.name}` : '',
    character?.description || character?.data?.description,
    story.world ? `world: ${story.world}` : '',
    'dramatic key visual, no text, no logo',
  ])
}

export function buildChatMessageImagePrompt(
  message: ChatMessage,
  nearbyMessages: ChatMessage[],
  character?: Character | null,
): string {
  const context = nearbyMessages
    .slice(-4)
    .map((item) => `${item.role}: ${stripMarkdown(item.content).slice(0, 320)}`)
    .join('\n')
  return [
    character ? `Scene illustration with ${character.name}.` : 'Scene illustration.',
    character?.description || character?.data?.description || '',
    `Selected message: ${stripMarkdown(message.content).slice(0, 900)}`,
    context ? `Recent context:\n${context}` : '',
    'cinematic composition, no text, no speech bubbles',
  ]
    .filter(Boolean)
    .join('\n')
}
