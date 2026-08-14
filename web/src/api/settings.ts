import { apiPost } from './client'
import { aibarSettingsSchema } from './schemas'

// AIBAR 设置走专用端点 /api/aibar/settings/*：服务端在 settings.json 的 aibar 键下
// 浅合并。之前前端拉取整个 ST settings blob 再整体写回，会和 /st-compat 原生界面的
// 设置写入发生 last-writer-wins 互相覆盖；现在两边各写各的键，互不干扰。
let cached: Record<string, unknown> | null = null
let settingsGeneration = 0
let fetchState: {
  generation: number
  promise: Promise<Record<string, unknown>>
} | null = null
let saveQueue: Promise<void> = Promise.resolve()

async function fetchAibarSettings(): Promise<Record<string, unknown>> {
  const r = await apiPost<{ settings?: unknown }>('/api/aibar/settings/get')
  const parsed = aibarSettingsSchema.safeParse(r?.settings)
  return parsed.success ? parsed.data : {}
}

export async function loadAibarSettings<T = Record<string, unknown>>(): Promise<T> {
  const generation = settingsGeneration
  if (!cached) {
    if (!fetchState || fetchState.generation !== generation) {
      const promise = fetchAibarSettings()
      fetchState = { generation, promise }
    }
    const state = fetchState
    let aibar: Record<string, unknown>
    try {
      aibar = await state.promise
    } catch (error) {
      if (fetchState === state) fetchState = null
      throw error
    }
    if (generation === settingsGeneration) {
      cached = aibar
      if (fetchState === state) fetchState = null
    }
    return aibar as T
  }
  return cached as T
}

export function saveAibarSettings(updates: Record<string, unknown>): Promise<void> {
  const generation = settingsGeneration
  // 本地仍串行化写入：保证同一会话内的更新按提交顺序到达服务端。
  const task = saveQueue.then(async () => {
    if (generation !== settingsGeneration) return
    const r = await apiPost<{ settings?: unknown }>('/api/aibar/settings/save', updates)
    if (generation !== settingsGeneration) return
    const parsed = aibarSettingsSchema.safeParse(r?.settings)
    if (parsed.success) cached = parsed.data
  })
  saveQueue = task.catch(() => {})
  return task
}

export function invalidateSettingsCache(): void {
  settingsGeneration += 1
  cached = null
  fetchState = null
}
