import type { Character, ChatMessage, ModelProfile } from '@/api/types'
import { buildChatCompletionPayload } from './buildPayload'

export interface ReplyDraftOption {
  id: string
  title: string
  direction: string
  message: string
}

const REPLY_CONTEXT_MESSAGES = 32
const REPLY_DRAFT_PRESET = {
  id: 'aibar-reply-draft',
  name: 'Reply Draft',
  temperature: 0.85,
  topP: 0.95,
  maxTokens: 1800,
  presencePenalty: 0.2,
  frequencyPenalty: 0.1,
  systemPrompt: '',
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseJsonObject<T>(text: string): T {
  let body = text.trim()
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) body = fence[1].trim()

  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('模型没有返回可解析的 JSON')
  }

  return JSON.parse(body.slice(start, end + 1)) as T
}

function formatTranscript(messages: ChatMessage[], userName: string, characterName: string): string {
  return messages
    .slice(-REPLY_CONTEXT_MESSAGES)
    .map((message, index) => {
      const content = message.content.trim()
      if (!content) return ''
      const speaker =
        message.role === 'assistant'
          ? characterName
          : message.role === 'system'
            ? '系统'
            : userName
      return `${index + 1}. ${speaker}：${content}`
    })
    .filter(Boolean)
    .join('\n\n')
}

export function buildReplyDraftPayload(
  profile: ModelProfile,
  character: Character,
  messages: ChatMessage[],
  options: {
    userName: string
    personaDescription?: string
    memorySummary?: string
    worldInfoText?: string
    userNote?: string
  },
): Record<string, unknown> {
  const characterContext = {
    name: character.name,
    description: character.description || character.data?.description || '',
    personality: character.personality || character.data?.personality || '',
    scenario: character.scenario || character.data?.scenario || '',
  }
  const transcript = formatTranscript(messages, options.userName, character.name || '角色')
  const systemPrompt = [
    '你是 AIBAR 的玩家回复导演，负责帮用户在角色扮演聊天中拟定下一条“用户消息”。',
    '只站在用户/玩家一侧写回复，不要替角色继续说话，也不要写角色接下来的反应。',
    '生成 5 个明显不同的剧情推进方向：可以包含安抚关系、主动调查、制造冲突、坦白/试探、反差转折等，但要根据当前剧情自然调整。',
    '每个选项都要包含一个短标题、一个方向说明、以及一条可直接发送但仍方便用户编辑的回复。',
    '回复要能推动剧情，不要只是寒暄；保持自然口语，通常 1 到 3 句。',
    '只返回 JSON，不要 Markdown，不要解释。',
    'JSON schema: {"options":[{"title":"","direction":"","message":""}]}',
  ].join('\n')
  const userPrompt = [
    '角色设定：',
    JSON.stringify(characterContext, null, 2),
    '',
    `用户名称：${options.userName}`,
    options.personaDescription ? `用户身份：${options.personaDescription}` : '',
    options.memorySummary ? `长期记忆 / 背景信息：\n${options.memorySummary}` : '',
    options.worldInfoText ? `世界书命中信息：\n${options.worldInfoText}` : '',
    options.userNote ? `用户已有想法或想让你参考的方向：\n${options.userNote}` : '',
    '',
    `最近对话：\n${transcript || '暂无对话，请基于角色设定给出开局回复方向。'}`,
  ].filter(Boolean).join('\n')

  return buildChatCompletionPayload(
    profile,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    character,
    REPLY_DRAFT_PRESET,
    options.userName,
  )
}

export function parseReplyDraftOptions(text: string): ReplyDraftOption[] {
  const raw = parseJsonObject<{ options?: unknown }>(text)
  const list = Array.isArray(raw.options) ? raw.options : []

  return list
    .map((item, index) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const message = asString(record.message)
      return {
        id: `reply-${index + 1}`,
        title: asString(record.title) || `方向 ${index + 1}`,
        direction: asString(record.direction),
        message,
      }
    })
    .filter((option) => option.message)
    .slice(0, 5)
}
