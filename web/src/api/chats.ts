import { apiPost, apiPostForm } from './client'
import type { ChatMessage, ChatEntry } from './types'

type ServerChatMessage = {
  chat_metadata?: Record<string, unknown>
  mes?: string
  is_user?: boolean
  role?: string
  send_date?: string
  date?: string
  swipes?: string[]
  swipe_id?: number
  name?: string
  extra?: { aibar?: { images?: ChatMessage['images'] } }
}

export async function fetchChat(
  chName: string,
  fileName: string,
  avatarUrl: string,
): Promise<{ metadata: Record<string, unknown>; messages: ChatMessage[] }> {
  const data = await apiPost<ServerChatMessage[]>('/api/chats/get', {
    ch_name: chName,
    file_name: fileName,
    avatar_url: avatarUrl,
  })
  const arr = Array.isArray(data) ? data : []
  const header = arr.find((m) => m?.chat_metadata)
  const metadata: Record<string, unknown> = {
    simple_ui: true,
    ...(header?.chat_metadata || {}),
  }
  const messages: ChatMessage[] = arr
    .filter((m) => m && !m.chat_metadata && m.mes)
    .map(mapServerMessage)

  return { metadata, messages }
}

export async function saveChat(
  chName: string,
  fileName: string,
  avatarUrl: string,
  messages: ChatMessage[],
  metadata?: Record<string, unknown>,
): Promise<unknown> {
  const chatHeader = {
    chat_metadata: {
      simple_ui: true,
      ...(metadata || {}),
    },
    user_name: 'User',
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
  const images = Array.isArray(m.extra?.aibar?.images) ? m.extra.aibar.images : []
  return {
    role: isUser ? 'user' : 'assistant',
    content: m.mes || '',
    date: m.send_date || m.date || new Date().toISOString(),
    swipes: m.swipes || [],
    swipe_id: m.swipe_id,
    name: m.name,
    images,
  }
}

function mapClientMessage(m: ChatMessage, chName: string): Record<string, unknown> {
  const isUser = m.role === 'user'
  return {
    name: m.name || (isUser ? 'User' : chName || 'Character'),
    is_user: isUser,
    send_date: m.date || new Date().toISOString(),
    mes: m.content,
    extra: {
      aibar: {
        images: m.images || [],
      },
    },
    swipes: m.swipes || [],
    swipe_id: m.swipe_id,
  }
}
