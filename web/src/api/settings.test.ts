import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({ apiPost: vi.fn() }))
import { apiPost } from './client'
import { invalidateSettingsCache, loadAibarSettings, saveAibarSettings } from './settings'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  invalidateSettingsCache()
  vi.resetAllMocks()
})

it('保存成功后才返回的旧读取，不能覆盖缓存或交给等待中的组件', async () => {
  const reading = deferred<{ settings: { theme: string } }>()
  vi.mocked(apiPost).mockReturnValueOnce(reading.promise).mockResolvedValueOnce({ settings: { theme: 'new' } })
  const pending = loadAibarSettings()
  await saveAibarSettings({ theme: 'new' })
  reading.resolve({ settings: { theme: 'old' } })
  expect(await pending).toEqual({ theme: 'new' })
  expect(await loadAibarSettings()).toEqual({ theme: 'new' })
  expect(apiPost).toHaveBeenCalledTimes(2)
})

it('排队保存保留提交时快照，后续表单编辑不改变尚未发送的更新', async () => {
  const first = deferred<{ settings: Record<string, unknown> }>()
  vi.mocked(apiPost).mockReturnValueOnce(first.promise).mockResolvedValueOnce({ settings: {} })
  const pending = saveAibarSettings({ theme: 'dark' })
  const updates = { personas: [{ name: '提交时名称' }] }
  const queued = saveAibarSettings(updates)
  updates.personas[0].name = '尚未提交的编辑'
  first.resolve({ settings: { theme: 'dark' } })
  await Promise.all([pending, queued])
  expect(apiPost).toHaveBeenLastCalledWith('/api/aibar/settings/save', { personas: [{ name: '提交时名称' }] })
})

it('切换账号会丢弃旧账号排队的保存和迟到的读取缓存', async () => {
  const reading = deferred<{ settings: Record<string, unknown> }>()
  vi.mocked(apiPost).mockReturnValueOnce(reading.promise).mockResolvedValueOnce({ settings: { account: 'new' } })
  const pending = loadAibarSettings()
  const queued = saveAibarSettings({ account: 'old' })
  invalidateSettingsCache()
  reading.resolve({ settings: { account: 'old' } })
  await Promise.all([pending, queued])
  expect(await loadAibarSettings()).toEqual({ account: 'new' })
  expect(apiPost).toHaveBeenCalledTimes(2)
})
