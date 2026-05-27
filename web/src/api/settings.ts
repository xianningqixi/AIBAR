import { apiPost } from './client'

let cachedRaw: Record<string, unknown> | null = null

async function fetchSettingsRaw(): Promise<Record<string, unknown>> {
  const r = await apiPost<{ settings?: string }>('/api/settings/get')
  const raw = r?.settings
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function loadAibarSettings<T = Record<string, unknown>>(): Promise<T> {
  if (!cachedRaw) cachedRaw = await fetchSettingsRaw()
  const aibar = (cachedRaw.aibar as Record<string, unknown>) || {}
  return aibar as T
}

export async function saveAibarSettings(updates: Record<string, unknown>): Promise<void> {
  cachedRaw = await fetchSettingsRaw()
  const aibar = (cachedRaw.aibar as Record<string, unknown>) || {}
  cachedRaw.aibar = { ...aibar, ...updates }
  await apiPost('/api/settings/save', cachedRaw)
}

export function invalidateSettingsCache(): void {
  cachedRaw = null
}
