import type { Character, ChatMessage, ModelProfile, Preset } from '@/api/types'
import type { ModItem } from '@/stores/mods'
import { normalizeText, trimText } from './format'

const HISTORY_CHAR_BUDGET = 48_000
const HISTORY_MESSAGE_LIMIT = 120

// 注意：telegram-bot/src/index.js 的 buildGeneratePayload/getSystemPrompt 是本文件
// 提示词拼装逻辑的 Node 端平行实现（浏览器与 bot 无法共享包）。调整系统提示词
// 结构、字段注入顺序时必须同步修改两边。

export function selectRecentMessages(
  sourceMessages: ChatMessage[],
  charBudget = HISTORY_CHAR_BUDGET,
): Array<{ role: 'assistant' | 'user'; content: string }> {
  const selected: Array<{ role: 'assistant' | 'user'; content: string }> = []
  let used = 0
  for (let index = sourceMessages.length - 1; index >= 0 && selected.length < HISTORY_MESSAGE_LIMIT; index -= 1) {
    const message = sourceMessages[index]
    const content = String(message.content || '')
    const cost = content.length + 16
    if (selected.length && used + cost > charBudget) break
    selected.push({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: selected.length ? content : content.slice(-charBudget),
    })
    used += Math.min(cost, charBudget)
  }
  return selected.reverse()
}

// 采样参数一律来自 ModelProfile：需要临时覆盖的调用方请展开 profile 后再传入
export function buildChatCompletionPayload(
  config: ModelProfile,
  messages: Array<{ role: string; content: string }>,
  character: Character,
  userName = 'User',
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    type: 'normal',
    aibar_model_id: config.id,
    messages,
    model: config.model,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    // stream 由发送方决定：apiStream 注入 stream:true，非流式请求缺省即为 false
    top_p: config.topP,
    presence_penalty: config.presencePenalty,
    frequency_penalty: config.frequencyPenalty,
    chat_completion_source: config.source,
    user_name: userName,
    char_name: character.name || 'Character',
  }

  return payload
}

export function getSystemPrompt(
  character: Character,
  worldInfoText = '',
  mods: ModItem[] = [],
  presetSystemPrompt = '',
  personaDescription = '',
  memorySummary = '',
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
    personaDescription ? `用户身份：${personaDescription}` : '',
    memorySummary ? `长期记忆 / 背景信息：\n${memorySummary}` : '',
    `你正在扮演角色：${character.name || '未命名角色'}。`,
    description ? `角色描述：\n${description}` : '',
    personality ? `性格：\n${personality}` : '',
    scenario ? `场景：\n${scenario}` : '',
    mesExample ? `对话示例：\n${mesExample}` : '',
    worldInfoText ? `世界书：\n${worldInfoText}` : '',
    presetSystemPrompt ? `额外指令：\n${presetSystemPrompt}` : '',
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
  preset?: Preset | null,
  userName = 'User',
  personaDescription = '',
  memorySummary = '',
): Record<string, unknown> {
  const recentMessages = selectRecentMessages(sourceMessages)

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

  const presetSystemPrompt = preset?.systemPrompt || ''
  const systemPrompt = getSystemPrompt(
    character,
    worldInfoText,
    mods,
    presetSystemPrompt,
    personaDescription,
    memorySummary,
  )
  const messages = [{ role: 'system', content: systemPrompt }, ...recentMessages]

  return buildChatCompletionPayload(config, messages, character, userName)
}
