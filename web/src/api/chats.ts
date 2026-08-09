import { apiPost, apiPostForm } from './client'
import type { ChatMessage, ChatEntry } from './types'

export type ServerChatMessage = Record<string, unknown> & {
  chat_metadata?: Record<string, unknown>
  mes?: string
  is_user?: boolean
  role?: string
  send_date?: string
  date?: string
  swipes?: string[]
  swipe_id?: number
  name?: string
  extra?: { aibar?: { images?: ChatMessage['images']; [key: string]: unknown }; [key: string]: unknown }
}

// 后端 /api/chats/get 的 strict 契约（SillyTavern/src/endpoints/chats.js）：
// - 数组：聊天内容；文件不存在或为空时是 []（全新聊天）
// - 空对象 {}：角色聊天目录尚不存在（同样是全新聊天）
// - HTTP 500 {error}：文件读取或 JSONL 解析失败
// 任何其他形状都视为异常，绝不能当成空聊天，否则下一次保存会覆盖掉损坏但仍可挽救的存档。
function normalizeStrictChatData(data: unknown): ServerChatMessage[] {
  if (Array.isArray(data)) return data as ServerChatMessage[]
  if (data && typeof data === 'object' && Object.keys(data).length === 0) return []
  throw new Error('聊天数据格式异常，已停止加载以保护原始存档')
}

export async function fetchChat(
  chName: string,
  fileName: string,
  avatarUrl: string,
): Promise<{
  metadata: Record<string, unknown>
  messages: ChatMessage[]
  serverHeader?: Record<string, unknown>
}> {
  // strict：让后端在读不动 / 解析失败时返回 500，而不是伪装成空聊天
  const data = await apiPost<unknown>('/api/chats/get', {
    ch_name: chName,
    file_name: fileName,
    avatar_url: avatarUrl,
    strict: true,
  })
  const arr = normalizeStrictChatData(data)
  const header = arr.find((m) => m?.chat_metadata)
  const metadata: Record<string, unknown> = {
    simple_ui: true,
    ...(header?.chat_metadata || {}),
  }
  const messages: ChatMessage[] = arr
    .filter((m) => m && !m.chat_metadata && typeof m.mes === 'string')
    .map(mapServerMessage)

  return {
    metadata,
    messages,
    serverHeader: header ? { ...header } : undefined,
  }
}

export async function saveChat(
  chName: string,
  fileName: string,
  avatarUrl: string,
  messages: ChatMessage[],
  metadata?: Record<string, unknown>,
  serverHeader?: Record<string, unknown>,
): Promise<unknown> {
  const originalMetadata = (
    serverHeader?.chat_metadata
    && typeof serverHeader.chat_metadata === 'object'
    && !Array.isArray(serverHeader.chat_metadata)
  ) ? serverHeader.chat_metadata as Record<string, unknown> : {}
  const chatHeader = {
    ...(serverHeader || {}),
    chat_metadata: {
      ...originalMetadata,
      simple_ui: true,
      ...(metadata || {}),
    },
    user_name: serverHeader?.user_name || 'User',
    character_name: chName,
  }
  return apiPost('/api/chats/save', {
    ch_name: chName,
    file_name: fileName,
    avatar_url: avatarUrl,
    chat: [chatHeader, ...messages.map(m => mapClientMessage(m, chName))],
    force: true,
  })
}

export async function fetchRecentChats(max = 500): Promise<ChatEntry[]> {
  const result = await apiPost<ChatEntry[]>('/api/chats/recent', { max, metadata: true, pinned: [] })
  return Array.isArray(result)
    ? result
        .filter((s) => s && s.file_name)
        .map((s) => ({
          ...s,
          file_id: s.file_id || String(s.file_name).replace(/\.jsonl$/i, ''),
        }))
    : []
}

export async function renameChat(
  chName: string,
  oldFileName: string,
  newFileName: string,
  avatarUrl: string,
): Promise<unknown> {
  return apiPost('/api/chats/rename', {
    ch_name: chName,
    original_file: ensureJsonl(oldFileName),
    renamed_file: ensureJsonl(newFileName),
    avatar_url: avatarUrl,
  })
}

export async function deleteChat(
  chName: string,
  fileName: string,
  avatarUrl: string,
): Promise<unknown> {
  return apiPost('/api/chats/delete', {
    ch_name: chName,
    chatfile: ensureJsonl(fileName),
    avatar_url: avatarUrl,
  })
}

function ensureJsonl(fileName: string): string {
  return /\.jsonl$/i.test(fileName) ? fileName : `${fileName}.jsonl`
}

export async function exportChat(
  avatarUrl: string,
  fileName: string,
): Promise<{ filename: string; content: string }> {
  const file = ensureJsonl(fileName)
  const base = file.replace(/\.jsonl$/i, '')
  const r = await apiPost<{ message?: string; result?: string }>('/api/chats/export', {
    avatar_url: avatarUrl,
    file,
    format: 'jsonl',
    exportfilename: base,
    is_group: false,
  })
  return { filename: `${base}.jsonl`, content: r.result || '' }
}

export async function importChat(
  avatarUrl: string,
  characterName: string,
  file: File,
): Promise<{ res?: boolean; message?: string; fileNames?: string[] }> {
  const fd = new FormData()
  fd.append('avatar', file)
  fd.append('avatar_url', avatarUrl)
  fd.append('character_name', characterName)
  fd.append('user_name', 'User')
  fd.append(
    'file_type',
    file.name.toLowerCase().endsWith('.jsonl') ? 'jsonl' : 'json',
  )
  return apiPostForm<{ res?: boolean; message?: string; fileNames?: string[] }>(
    '/api/chats/import',
    fd,
  )
}

function mapServerMessage(m: ServerChatMessage): ChatMessage {
  const isUser = m.is_user === true || m.role === 'user'
  const isSystem = m.is_system === true || m.role === 'system'
  const images = Array.isArray(m.extra?.aibar?.images) ? m.extra.aibar.images : []
  return {
    role: isSystem ? 'system' : isUser ? 'user' : 'assistant',
    content: m.mes || '',
    date: m.send_date || m.date || new Date().toISOString(),
    swipes: m.swipes || [],
    swipe_id: m.swipe_id,
    name: m.name,
    images,
    serverData: { ...m },
  }
}

function mapClientMessage(m: ChatMessage, chName: string): Record<string, unknown> {
  const isUser = m.role === 'user'
  const isSystem = m.role === 'system'
  const original = m.serverData || {}
  const originalExtra = (
    original.extra
    && typeof original.extra === 'object'
    && !Array.isArray(original.extra)
  ) ? original.extra as Record<string, unknown> : {}
  const originalAibar = (
    originalExtra.aibar
    && typeof originalExtra.aibar === 'object'
    && !Array.isArray(originalExtra.aibar)
  ) ? originalExtra.aibar as Record<string, unknown> : {}
  return {
    ...original,
    name: m.name || (isUser ? 'User' : chName || 'Character'),
    is_user: isUser,
    is_system: isSystem,
    send_date: m.date || new Date().toISOString(),
    mes: m.content,
    extra: {
      ...originalExtra,
      aibar: {
        ...originalAibar,
        images: m.images || [],
      },
    },
    swipes: m.swipes || [],
    swipe_id: m.swipe_id,
  }
}
