import type { Character, ChatMessage, ModelProfile } from '@/api/types'
import type { ModItem } from '@/stores/mods'
import { providerConfigs } from './providers'
import { normalizeText, trimText } from './format'

export function buildChatCompletionPayload(
  config: ModelProfile,
  messages: Array<{ role: string; content: string }>,
  character: Character,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    type: 'normal',
    messages,
    model: config.model,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: false,
    top_p: config.topP,
    presence_penalty: config.presencePenalty,
    frequency_penalty: config.frequencyPenalty,
    chat_completion_source: config.source,
    user_name: 'User',
    char_name: character.name || 'Character',
  }

  if (config.secretId) {
    payload.secret_id = config.secretId
  }

  const provider = providerConfigs[config.source]
  if (config.source === 'custom') {
    payload.custom_url = config.endpoint
  } else if (provider?.endpointKey === 'reverse_proxy' && config.endpoint) {
    payload.reverse_proxy = config.endpoint
  }

  return payload
}

export function getSystemPrompt(
  character: Character,
  worldInfoText = '',
  mods: ModItem[] = [],
): string {
  const personality = trimText(character.data?.personality || character.personality)
  const scenario = trimText(character.data?.scenario || character.scenario)
  const description = trimText(
    character.description || character.data?.description || '',
  )
  const systemPrompt = trimText(character.data?.system_prompt)
  const mesExample = trimText(character.data?.mes_example || character.mes_example)

  const modPrepend = mods
    .filter((m) => m.enabled && m.position === 'system_prepend')
    .map((m) => trimText(m.content))
    .filter(Boolean)
    .join('\n\n')
  const modAppend = mods
    .filter((m) => m.enabled && m.position === 'system_append')
    .map((m) => trimText(m.content))
    .filter(Boolean)
    .join('\n\n')

  const pieces = [
    modPrepend,
    `你正在扮演角色：${character.name || '未命名角色'}。`,
    description ? `角色描述：\n${description}` : '',
    personality ? `性格：\n${personality}` : '',
    scenario ? `场景：\n${scenario}` : '',
    mesExample ? `对话示例：\n${mesExample}` : '',
    worldInfoText ? `世界书：\n${worldInfoText}` : '',
    systemPrompt ? systemPrompt : '保持角色口吻，直接回应用户，不要解释你是模型。',
    modAppend,
  ].filter(Boolean)

  return pieces.join('\n\n')
}

export function getCharacterChatName(character: Character, routeChat?: string): string {
  if (routeChat) return routeChat.replace(/\.jsonl$/i, '')

  const existing = normalizeText(character.chat)
  if (existing) return existing.replace(/\.jsonl$/i, '')

  const base = normalizeText(character.name || character.avatar || 'Simple Chat').replace(
    /[\\/:*?"<>|]/g,
    ' ',
  )
  return `${base} - Simple`
}

export function buildGeneratePayload(
  config: ModelProfile,
  character: Character,
  sourceMessages: ChatMessage[],
  worldInfoText = '',
  mods: ModItem[] = [],
): Record<string, unknown> {
  const recentMessages = sourceMessages.slice(-24).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }))

  const userSuffix = mods
    .filter((m) => m.enabled && m.position === 'user_suffix')
    .map((m) => trimText(m.content))
    .filter(Boolean)
    .join('\n\n')

  if (userSuffix && recentMessages.length) {
    const lastUserIdx = [...recentMessages].reverse().findIndex((m) => m.role === 'user')
    if (lastUserIdx !== -1) {
      const idx = recentMessages.length - 1 - lastUserIdx
      recentMessages[idx] = {
        ...recentMessages[idx],
        content: `${recentMessages[idx].content}\n\n${userSuffix}`,
      }
    }
  }

  const systemPrompt = getSystemPrompt(character, worldInfoText, mods)
  const messages = [{ role: 'system', content: systemPrompt }, ...recentMessages]

  return buildChatCompletionPayload(config, messages, character)
}
