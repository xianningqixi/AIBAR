import { apiPost, apiPostForm, apiPostBlob } from './client'
import type { Character, ChatEntry } from './types'

export interface CharacterImportResponse {
  error?: boolean
  file_name?: string
}

export async function fetchCharacters(): Promise<Character[]> {
  const chars = await apiPost('/api/characters/all')
  return Array.isArray(chars) ? chars.filter((c: Character) => c && c.name) : []
}

export async function fetchCharacter(avatar: string): Promise<Character> {
  return apiPost('/api/characters/get', { avatar_url: avatar })
}

export async function createCharacter(data: Record<string, unknown>): Promise<unknown> {
  return apiPost('/api/characters/create', data)
}

export async function editCharacter(avatar: string, data: Record<string, unknown>): Promise<unknown> {
  return apiPost('/api/characters/edit', { avatar_url: avatar, ...data })
}

export async function editCharacterAvatar(avatar: string, file: Blob, fileName = 'avatar.png'): Promise<unknown> {
  const fd = new FormData()
  fd.append('avatar', file, fileName)
  fd.append('avatar_url', avatar)
  return apiPostForm('/api/characters/edit-avatar', fd)
}

export async function deleteCharacter(avatar: string): Promise<unknown> {
  return apiPost('/api/characters/delete', { avatar_url: avatar, delete_chats: true })
}

export async function mergeAttributes(avatar: string, attrs: Record<string, unknown>): Promise<unknown> {
  return apiPost('/api/characters/merge-attributes', { avatar, ...attrs })
}

export async function importCharacter(file: File): Promise<CharacterImportResponse> {
  const fmt = file.name.split('.').pop()?.toLowerCase() || 'png'
  const fd = new FormData()
  fd.append('avatar', file)
  fd.append('file_type', fmt)
  fd.append('user_name', 'User')
  const result = await apiPostForm<CharacterImportResponse>('/api/characters/import', fd)
  if (result?.error) {
    const message = fmt === 'png'
      ? 'ST 没有从这张 PNG 里读到角色卡数据，请确认复制的是卡体 PNG，不是普通图片或预览图'
      : `ST 导入 ${fmt.toUpperCase()} 角色卡失败，请确认文件格式有效`
    throw new Error(message)
  }
  return result
}

export async function exportCharacter(avatar: string, format: string): Promise<Blob> {
  return apiPostBlob('/api/characters/export', { avatar_url: avatar, format })
}

export async function toggleFavorite(character: Character): Promise<boolean> {
  const next = character.fav !== 'true'
  await mergeAttributes(character.avatar, {
    fav: String(next),
    data: {
      extensions: {
        ...(character.data?.extensions || {}),
        fav: next,
      },
    },
  })
  return next
}

export async function fetchCharacterChats(avatar: string): Promise<ChatEntry[]> {
  const result = await apiPost('/api/characters/chats', { avatar_url: avatar, metadata: true })
  return Array.isArray(result)
    ? result
        .filter((item: any) => item && item.file_name)
        .map((item: any) => ({
          ...item,
          file_id: item.file_id || String(item.file_name).replace(/\.jsonl$/i, ''),
        }))
    : []
}

export async function setCharacterChat(avatar: string, filename: string): Promise<unknown> {
  const chatName = filename.replace(/\.jsonl$/i, '')
  return mergeAttributes(avatar, { chat: chatName })
}
