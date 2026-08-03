import { apiGet, apiPost, apiPostBlobResponse, apiPostForm } from './client'
import type { CommunityWork } from './community'
import type { DiscordImportManifest } from '@/lib/discordImportQueue'

export type ServerDiscordImportStatus =
  | 'queued'
  | 'downloading'
  | 'validated'
  | 'published'
  | 'duplicate'
  | 'skipped'
  | 'failed'

export interface ServerDiscordImportItem {
  id: string
  cardId: string
  threadId: string
  status: ServerDiscordImportStatus
  fileName: string
  fileSha256: string
  error: string
  workId: string
  workVersionId: string
  updatedAt: string
}

export interface ServerDiscordImportBatch {
  id: string
  status: 'active' | 'completed'
  manifest: DiscordImportManifest
  items: ServerDiscordImportItem[]
  createdAt: string
  updatedAt: string
}

export interface ResolvedDiscordImportFile {
  blob: Blob
  itemId: string
  fileName: string
  fileSha256: string
}

export interface PublishedDiscordImportItem {
  item: ServerDiscordImportItem
  work: CommunityWork | null
}

export function registerDiscordImportBatch(manifest: DiscordImportManifest): Promise<ServerDiscordImportBatch> {
  return apiPost('/api/aibar/admin/discord-import/batches', { manifest })
}

export function getLatestDiscordImportBatch(): Promise<ServerDiscordImportBatch> {
  return apiGet('/api/aibar/admin/discord-import/batches/latest')
}

export function clearDiscordImportBatch(batchId: string): Promise<unknown> {
  return apiPost(`/api/aibar/admin/discord-import/batches/${encodeURIComponent(batchId)}/clear`)
}

export async function resolveDiscordImportItem(
  itemId: string,
  url: string,
): Promise<ResolvedDiscordImportFile> {
  const response = await apiPostBlobResponse(
    `/api/aibar/admin/discord-import/items/${encodeURIComponent(itemId)}/resolve`,
    { url },
  )
  const encodedFileName = response.headers.get('X-AIBAR-File-Name') || ''
  const fileName = (() => {
    try {
      return decodeURIComponent(encodedFileName)
    } catch {
      return ''
    }
  })()
  return {
    blob: await response.blob(),
    itemId: response.headers.get('X-AIBAR-Discord-Item-Id') || itemId,
    fileName,
    fileSha256: response.headers.get('X-AIBAR-Content-SHA256') || '',
  }
}

export async function uploadDiscordImportItem(
  itemId: string,
  file: File,
): Promise<ServerDiscordImportItem> {
  const form = new FormData()
  form.append('avatar', file)
  return apiPostForm(`/api/aibar/admin/discord-import/items/${encodeURIComponent(itemId)}/upload`, form)
}

export function publishDiscordImportItem(
  itemId: string,
  sourceId: string,
): Promise<PublishedDiscordImportItem> {
  return apiPost(`/api/aibar/admin/discord-import/items/${encodeURIComponent(itemId)}/publish`, { sourceId })
}

export function failDiscordImportItem(itemId: string, error: string): Promise<ServerDiscordImportItem> {
  return apiPost(`/api/aibar/admin/discord-import/items/${encodeURIComponent(itemId)}/fail`, { error })
}
