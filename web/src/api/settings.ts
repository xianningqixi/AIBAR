import { apiPost } from './client'

let cachedRaw: Record<string, unknown> | null = null
let settingsGeneration = 0
let fetchState: {
  generation: number
  promise: Promise<Record<string, unknown>>
} | null = null
let saveQueue: Promise<void> = Promise.resolve()

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
  const generation = settingsGeneration
  if (!cachedRaw) {
    if (!fetchState || fetchState.generation !== generation) {
      const promise = fetchSettingsRaw()
      fetchState = { generation, promise }
    }
    const state = fetchState
    let raw: Record<string, unknown>
    try {
      raw = await state.promise
    } catch (error) {
      if (fetchState === state) fetchState = null
      throw error
    }
    if (generation === settingsGeneration) {
      cachedRaw = raw
      if (fetchState === state) fetchState = null
    }
    const aibar = (raw.aibar as Record<string, unknown>) || {}
    return aibar as T
  }
  const aibar = (cachedRaw.aibar as Record<string, unknown>) || {}
  return aibar as T
}

export function saveAibarSettings(updates: Record<string, unknown>): Promise<void> {
  const generation = settingsGeneration
  const task = saveQueue.then(async () => {
    if (generation !== settingsGeneration) return
    const raw = await fetchSettingsRaw()
    if (generation !== settingsGeneration) return

    const aibar = (raw.aibar as Record<string, unknown>) || {}
    const next = { ...raw, aibar: { ...aibar, ...updates } }
    if (generation !== settingsGeneration) return
    await apiPost('/api/settings/save', next)
    if (generation === settingsGeneration) cachedRaw = next
  })
  saveQueue = task.catch(() => {})
  return task
}

export function invalidateSettingsCache(): void {
  settingsGeneration += 1
  cachedRaw = null
  fetchState = null
}
