import { ApiError, getCsrfToken } from './client'

export type CommunityContentType = 'character' | 'unknown'

export interface CommunityDownload {
  blob: Blob
  fileName: string
  type: CommunityContentType
  mimeType: string
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
