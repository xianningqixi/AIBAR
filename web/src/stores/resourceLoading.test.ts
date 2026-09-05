import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/characters', () => ({ fetchCharacters: vi.fn(), toggleFavorite: vi.fn(), mergeAttributes: vi.fn() }))
vi.mock('@/api/stories', () => ({ listStories: vi.fn() }))
vi.mock('@/api/worldInfo', () => ({ listWorldInfo: vi.fn() }))

import { fetchCharacters } from '@/api/characters'
import { listStories } from '@/api/stories'
import { listWorldInfo } from '@/api/worldInfo'
import { useCharactersStore } from './characters'
import { useStoriesStore } from './stories'
import { useWorldInfoStore } from './worldInfo'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
})

describe.each([
  { name: '角色', create: useCharactersStore, fetch: fetchCharacters },
  { name: '故事', create: useStoriesStore, fetch: listStories },
  { name: '世界书', create: useWorldInfoStore, fetch: listWorldInfo },
])('$name列表请求隔离', ({ create, fetch }) => {
  it('切换账号后立即加载新账号，旧请求结束不影响新请求的合并和加载状态', async () => {
    const oldRequest = deferred<[]>()
    const newRequest = deferred<[]>()
    vi.mocked(fetch).mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    const store = create()
    const oldLoad = store.load()
    store.reset()
    const newLoad = store.load()
    expect(fetch).toHaveBeenCalledTimes(2)
    oldRequest.resolve([])
    await oldLoad
    expect(store.loading).toBe(true)
    const concurrentLoad = store.load()
    expect(fetch).toHaveBeenCalledTimes(2)
    newRequest.resolve([])
    await Promise.all([newLoad, concurrentLoad])
    expect(store.loading).toBe(false)
  })
})

it('保存故事期间旧列表响应返回，不会把失效缓存重新标记为已加载', async () => {
  const oldRequest = deferred<Awaited<ReturnType<typeof listStories>>>()
  vi.mocked(listStories).mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce([])
  const store = useStoriesStore()
  const oldLoad = store.load()
  store.invalidate()
  oldRequest.resolve([{ id: 'deleted-story' } as Awaited<ReturnType<typeof listStories>>[number]])
  await oldLoad
  expect(store.loaded).toBe(false)
  await store.load()
  expect(listStories).toHaveBeenCalledTimes(2)
  expect(store.stories).toEqual([])
})

it('强制刷新世界书时，旧响应不能解除新请求的去重保护', async () => {
  const oldRequest = deferred<[]>()
  const newRequest = deferred<[]>()
  vi.mocked(listWorldInfo).mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
  const store = useWorldInfoStore()
  const oldLoad = store.load()
  const newLoad = store.load(true)
  oldRequest.resolve([])
  await oldLoad
  const concurrentLoad = store.load()
  expect(listWorldInfo).toHaveBeenCalledTimes(2)
  newRequest.resolve([])
  await Promise.all([newLoad, concurrentLoad])
})

it('角色导入后的强制刷新不会复用导入前的列表请求', async () => {
  const oldRequest = deferred<Awaited<ReturnType<typeof fetchCharacters>>>()
  const imported = { name: '新导入角色', avatar: 'new.png' } as Awaited<ReturnType<typeof fetchCharacters>>[number]
  vi.mocked(fetchCharacters).mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce([imported])
  const store = useCharactersStore()
  const oldLoad = store.load()
  await store.load(true)
  expect(store.characters).toEqual([imported])
  oldRequest.resolve([])
  await oldLoad
  expect(store.characters).toEqual([imported])
})
