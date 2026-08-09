import { fetchCharacter, setCharacterChat } from '@/api/characters'
import type { Character } from '@/api/types'
import { createCharacterChatName } from '@/lib/storyStart'

export const ST_COMPAT_APPROVAL_PREFIX = 'aibar.st-compat.approval.'
export const ST_COMPAT_APPROVAL_TTL_MS = 2 * 60 * 1000

export interface StCompatibilityApproval {
  version: 1
  avatar: string
  chat: string
  returnTo: string
  expiresAt: number
}

export async function fetchCharacterForRuntime(character: Character): Promise<Character> {
  if (!character.shallow && character.data && character.json_data) return character
  return fetchCharacter(character.avatar)
}

function safeReturnPath(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/aibar/'
}

export function createStCompatibilityApproval(
  character: Character,
  chat: string,
  returnTo: string,
  now = Date.now(),
): StCompatibilityApproval {
  return {
    version: 1,
    avatar: character.avatar,
    chat: chat.replace(/\.jsonl$/i, ''),
    returnTo: safeReturnPath(returnTo),
    expiresAt: now + ST_COMPAT_APPROVAL_TTL_MS,
  }
}

function createNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export async function launchStCompatibility(
  character: Character,
  options: { chat?: string; returnTo?: string } = {},
): Promise<never> {
  const chat = (options.chat || createCharacterChatName(character)).replace(/\.jsonl$/i, '')
  await setCharacterChat(character.avatar, chat)

  const returnTo = options.returnTo || `${window.location.pathname}${window.location.search}${window.location.hash}`
  const nonce = createNonce()
  const approval = createStCompatibilityApproval(character, chat, returnTo)
  sessionStorage.setItem(`${ST_COMPAT_APPROVAL_PREFIX}${nonce}`, JSON.stringify(approval))

  const target = new URL('/st-compat/', window.location.origin)
  target.searchParams.set('aibar_approval', nonce)
  window.location.assign(target)
  return new Promise<never>(() => undefined)
}
