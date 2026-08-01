import { apiPost, ApiError, getCsrfToken } from './client'

export type CommunityContentType = 'character' | 'unknown'

export interface CommunityDownload {
  blob: Blob
  fileName: string
  type: CommunityContentType
  mimeType: string
}

export type CommunityWorkType = 'character' | 'story' | 'mod'

export type CommunityModPosition = 'system_append' | 'system_prepend' | 'user_suffix'

export interface CommunityModSnapshot {
  name: string
  description: string
  content: string
  position: CommunityModPosition
}

export interface CommunityImportedMod extends CommunityModSnapshot {
  id: string
  enabled: boolean
  builtin: boolean
}

export interface CommunityWork {
  id: string
  type: CommunityWorkType
  title: string
  summary: string
  authorHandle: string
  authorName: string
  latestVersionId: string
  versionNumber: number
  versionNote: string
  tags: string[]
  coverUrl: string
  favorite: boolean
  myRating: number
  favoriteCount: number
  ratingAverage: number
  ratingCount: number
  commentCount: number
  launchCount: number
  publishedAt: string
  updatedAt: string
  status: 'published' | 'hidden'
  canManage: boolean
}

export interface CommunityWorkVersion {
  id: string
  versionNumber: number
  versionNote: string
  title: string
  summary: string
  createdAt: string
}

export interface CommunityComment {
  id: string
  userHandle: string
  userName: string
  body: string
  createdAt: string
  updatedAt: string
  mine: boolean
}

export interface CommunityWorkDetail extends CommunityWork {
  versions: CommunityWorkVersion[]
  comments: CommunityComment[]
  mod?: CommunityModSnapshot
}

export interface CommunityWorkList {
  works: CommunityWork[]
  page: number
  pageSize: number
  hasMore: boolean
}

export interface CommunityLaunchResult {
  launchId: string
  type: CommunityWorkType
  avatar?: string
  story?: import('./types').StoryCard | null
  mod?: CommunityImportedMod | null
  installedMods?: CommunityImportedMod[]
}

export function listCommunityWorks(input: {
  search?: string
  tag?: string
  type?: '' | CommunityWorkType
  ranking?: 'recommended' | 'recent' | 'daily' | 'weekly' | 'monthly' | 'all'
  favoritesOnly?: boolean
  mineOnly?: boolean
  includeHidden?: boolean
  page?: number
  pageSize?: number
} = {}): Promise<CommunityWorkList> {
  return apiPost('/api/aibar/works/list', input)
}

export function getCommunityWork(id: string): Promise<CommunityWorkDetail> {
  return apiPost('/api/aibar/works/get', { id })
}

export function publishCommunityWork(input: {
  sourceType: CommunityWorkType
  sourceId: string
  workId?: string
  title: string
  summary: string
  tags: string[]
  versionNote: string
}): Promise<CommunityWork> {
  return apiPost('/api/aibar/works/publish', input)
}

export function setCommunityFavorite(id: string, favorite: boolean): Promise<CommunityWork> {
  return apiPost('/api/aibar/works/favorite', { id, favorite })
}

export function rateCommunityWork(id: string, score: number): Promise<CommunityWork> {
  return apiPost('/api/aibar/works/rate', { id, score })
}

export function addCommunityComment(id: string, body: string): Promise<CommunityComment> {
  return apiPost('/api/aibar/works/comments/add', { id, body })
}

export function deleteCommunityComment(id: string): Promise<unknown> {
  return apiPost('/api/aibar/works/comments/delete', { id })
}

export function setCommunityWorkStatus(
  id: string,
  status: 'published' | 'hidden',
): Promise<CommunityWork> {
  return apiPost('/api/aibar/works/status', { id, status })
}

export function deleteCommunityWork(id: string): Promise<unknown> {
  return apiPost('/api/aibar/works/delete', { id })
}

export function launchCommunityWork(id: string, versionId?: string): Promise<CommunityLaunchResult> {
  return apiPost('/api/aibar/works/launch', { id, versionId })
}

export function completeCommunityLaunch(launchId: string, chatId: string): Promise<unknown> {
  return apiPost('/api/aibar/works/launch-complete', { launchId, chatId })
}

function decodeFileName(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function fileNameFromDisposition(disposition: string): string {
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utfMatch?.[1]) return decodeFileName(utfMatch[1].replace(/^"|"$/g, ''))

  const plainMatch = disposition.match(/filename="?([^";]+)"?/i)
  if (plainMatch?.[1]) return decodeFileName(plainMatch[1])

  return ''
}

function fallbackName(type: CommunityContentType): string {
  if (type === 'character') return 'community-character.png'
  return 'community-resource.dat'
}

export async function downloadCommunityContent(url: string): Promise<CommunityDownload> {
  const response = await fetch('/api/content/importURL', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCsrfToken(),
    },
    credentials: 'same-origin',
    body: JSON.stringify({ url }),
  })

  if (!response.ok) throw new ApiError(response.status, await response.text())

  const typeHeader = response.headers.get('X-Custom-Content-Type') || ''
  const type: CommunityContentType = typeHeader === 'character' ? 'character' : 'unknown'
  const disposition = response.headers.get('Content-Disposition') || ''
  const mimeType = response.headers.get('Content-Type') || ''
  const blob = await response.blob()

  return {
    blob,
    type,
    mimeType,
    fileName: fileNameFromDisposition(disposition) || fallbackName(type),
  }
}
