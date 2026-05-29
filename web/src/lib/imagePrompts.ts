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

function visualText(value: string | undefined, maxLength = 700): string {
  const withoutExamples = String(value || '')
    .split(/<START>|{{user}}:|{{char}}:/i)[0]
  const cleaned = stripMarkdown(withoutExamples)
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, maxLength).trim()}...`
}

function characterVisualSummary(character?: Character | null): string {
  if (!character) return ''
  const tags = character.tags?.length ? character.tags : character.data?.tags || []
  return joinParts([
    character.name ? `main character: ${character.name}` : '',
    visualText(character.data?.description || character.description, 520),
    visualText(character.data?.personality || character.personality, 260),
    visualText(character.data?.scenario || character.scenario, 260),
    tags.length ? `tags: ${tags.join(', ')}` : '',
  ])
}

export function buildCharacterImagePrompt(character: Partial<Character> & { name?: string }): string {
  const data = character.data
  const tags = character.tags?.length ? character.tags : data?.tags || []
  return joinParts([
    `character portrait of ${character.name || data?.name || 'the character'}`,
    visualText(data?.description || character.description, 700),
    visualText(data?.personality || character.personality, 320),
    visualText(data?.scenario || character.scenario, 320),
    tags.length ? `tags: ${tags.join(', ')}` : '',
    'single character, expressive face, clean composition',
  ])
}

export function buildStoryImagePrompt(story: Partial<StoryCard>, character?: Character | null): string {
  return joinParts([
    `cover art for story "${story.title || 'untitled story'}"`,
    visualText(story.summary, 280),
    visualText(story.scenario, 360),
    characterVisualSummary(character),
    story.world ? `world: ${visualText(story.world, 260)}` : '',
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
