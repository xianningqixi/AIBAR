import type { ChatMessage } from '@/api/types'

// 长期记忆摘要的纯函数部分：转写、截断、清洗与刷新判定。
// 网络调用与状态写回仍由 chat store 编排。

export const MEMORY_TRANSCRIPT_MAX_CHARS = 120000
export const MEMORY_SUMMARY_MAX_CHARS = 1800
export const MEMORY_REFRESH_MESSAGE_INTERVAL = 8

export function formatMemoryTranscript(
  historyMessages: ChatMessage[],
  userName: string,
  characterName: string,
): string {
  return historyMessages
    .map((message, index) => {
      const content = message.content.trim()
      if (!content) return ''
      const role =
        message.role === 'assistant'
          ? characterName
          : message.role === 'system'
            ? '系统'
            : userName
      return `${index + 1}. ${role}：${content}`
    })
    .filter(Boolean)
    .join('\n\n')
}

export function trimMemoryTranscript(transcript: string): string {
  if (transcript.length <= MEMORY_TRANSCRIPT_MAX_CHARS) return transcript
  return [
    '（早前内容已由旧记忆承接，下面保留最近的历史对话。）',
    transcript.slice(-MEMORY_TRANSCRIPT_MAX_CHARS),
  ].join('\n\n')
}

export function normalizeMemoryReply(reply: string): string {
  const cleaned = reply
    .trim()
    .replace(/^```[a-zA-Z0-9_-]*\s*/, '')
    .replace(/\s*```$/, '')
    .trim()

  if (!cleaned || /^(无|暂无|没有|空)$/i.test(cleaned)) return ''
  if (cleaned.length <= MEMORY_SUMMARY_MAX_CHARS) return cleaned
  return `${cleaned.slice(0, MEMORY_SUMMARY_MAX_CHARS).trim()}...`
}

/** 最后一条是刚生成的回复，不计入历史；历史每积累 8 条刷新一次摘要。 */
export function shouldRefreshMemory(sourceMessages: ChatMessage[], previousCount: number): boolean {
  const historyCount = Math.max(0, sourceMessages.length - 1)
  if (historyCount < 2) return false
  if (previousCount === 0) return true
  return historyCount - previousCount >= MEMORY_REFRESH_MESSAGE_INTERVAL
}

/** 组装记忆整理的两条 prompt 消息（system + user）。 */
export function buildMemoryPromptMessages(previousMemory: string, transcript: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是聊天记忆整理器，只负责整理历史对话背景。',
        '不要续写剧情，不要扮演角色，不要解释过程，只输出可直接注入下一轮角色扮演的背景记忆。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请把旧记忆与历史对话合并成一份稳定、紧凑的背景信息。',
        '保留：用户身份与偏好、角色关系变化、重要剧情事实、世界状态、未完成目标、关键约定。',
        '忽略：寒暄、重复措辞、无长期价值的临时表达。',
        `摘要控制在 ${MEMORY_SUMMARY_MAX_CHARS} 字以内；如果没有值得记忆的信息，输出“无”。`,
        '',
        `旧记忆：\n${previousMemory || '无'}`,
        '',
        `历史对话：\n${transcript}`,
      ].join('\n'),
    },
  ]
}
