import { apiPost, apiPostForm } from './client'
import type { WorldInfoFile, WorldInfoSummary } from './types'

export async function listWorldInfo(): Promise<WorldInfoSummary[]> {
  const result = await apiPost('/api/worldinfo/list')
  return Array.isArray(result) ? result : []
}

export async function getWorldInfo(name: string): Promise<WorldInfoFile> {
  return apiPost<WorldInfoFile>('/api/worldinfo/get', { name })
}

export async function saveWorldInfo(name: string, data: WorldInfoFile): Promise<unknown> {
  return apiPost('/api/worldinfo/edit', { name, data })
}

export async function deleteWorldInfo(name: string): Promise<unknown> {
  return apiPost('/api/worldinfo/delete', { name })
}

export async function importWorldInfo(file: File): Promise<{ name: string }> {
  const fd = new FormData()
  fd.append('file', file)
  return apiPostForm<{ name: string }>('/api/worldinfo/import', fd)
}
