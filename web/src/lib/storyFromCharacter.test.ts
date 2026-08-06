import { describe, expect, it } from 'vitest'
import type { Character } from '@/api/types'
import {
  characterGreetingPreview,
  isInteractiveCharacterGreeting,
} from './storyFromCharacter'

const character: Character = {
  name: '林月',
  avatar: 'lin-yue.png',
  data: { name: '林月' },
}

describe('character greeting previews', () => {
  it('keeps an ordinary opening intact', () => {
    expect(characterGreetingPreview(character, '欢迎来到雾城。')).toBe('欢迎来到雾城。')
  })

  it('does not render a large embedded frontend in the start dialog', () => {
    const greeting = `\`\`\`html\n<script>const payload = '${'A'.repeat(250_000)}'</script>\n\`\`\``

    expect(isInteractiveCharacterGreeting(character, greeting)).toBe(true)
    expect(characterGreetingPreview(character, greeting)).toBe('交互式前端开场')
  })

  it('limits long plain-text openings', () => {
    const preview = characterGreetingPreview(character, '雾'.repeat(2_000))

    expect(preview).toHaveLength(800)
    expect(preview.endsWith('...')).toBe(true)
  })

  it('recognizes cards that keep their frontend payload in extensions', () => {
    const frontendCharacter: Character = {
      ...character,
      data: {
        name: character.name,
        extensions: { app_payload: 'encoded-app' },
      },
    }

    expect(isInteractiveCharacterGreeting(frontendCharacter, '启动标记')).toBe(true)
  })
})
