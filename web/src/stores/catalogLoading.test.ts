import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
vi.mock('@/api/chats', () => ({ fetchRecentChats: vi.fn() }))
vi.mock('@/api/community', () => ({ listCommunityWorks: vi.fn(), listCommunityWorkTags: vi.fn() }))
import { fetchRecentChats } from '@/api/chats'
import { listCommunityWorks, listCommunityWorkTags, type CommunityWork } from '@/api/community'
import type { ChatEntry } from '@/api/types'
import { useRecentChatsStore } from './recentChats'
import { useCommunityCatalogStore } from './communityCatalog'
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
beforeEach(() => { setActivePinia(createPinia()); vi.resetAllMocks() })

it('完整聊天列表返回后，迟到的首页预览不会覆盖它', async () => {
  const preview = deferred<ChatEntry[]>()
  const entry = { file_name: 'new.jsonl' } as ChatEntry
  vi.mocked(fetchRecentChats).mockReturnValueOnce(preview.promise).mockResolvedValueOnce([entry])
  const store = useRecentChatsStore()
  const initial = store.load()
  await store.load(true)
  preview.resolve([])
  await initial
  expect(store.entries).toEqual([entry])
  expect(store.fullLoaded).toBe(true)
  await store.load(true)
  expect(fetchRecentChats).toHaveBeenCalledTimes(2)
})

it('聊天加载失败可重试；切换账号后忽略旧响应', async () => {
  vi.mocked(fetchRecentChats).mockRejectedValueOnce(new Error('连接中断')).mockResolvedValueOnce([])
  const store = useRecentChatsStore()
  await store.load(true)
  expect(store.error).toContain('连接中断')
  await store.load(true)
  expect(store.error).toBe('')
  const old = deferred<ChatEntry[]>()
  vi.mocked(fetchRecentChats).mockReturnValueOnce(old.promise)
  const request = store.load(true, true)
  store.reset()
  old.resolve([{ file_name: 'old.jsonl' } as ChatEntry])
  await request
  expect(store.entries).toEqual([])
  expect(store.loaded).toBe(false)
})

it('筛选切换时，旧社区结果和旧标签不能覆盖新类型', async () => {
  const oldWorks = deferred<Awaited<ReturnType<typeof listCommunityWorks>>>()
  const oldTags = deferred<Awaited<ReturnType<typeof listCommunityWorkTags>>>()
  vi.mocked(listCommunityWorks).mockReturnValueOnce(oldWorks.promise).mockResolvedValueOnce({ works: [], page: 1, pageSize: 20, hasMore: false })
  vi.mocked(listCommunityWorkTags).mockReturnValueOnce(oldTags.promise).mockResolvedValueOnce({ tags: [{ tag: '提示词', count: 1 }] })
  const store = useCommunityCatalogStore()
  const a = store.loadWorks(); const b = store.loadTags()
  store.type = 'mod'
  await Promise.all([store.loadWorks(), store.loadTags()])
  oldWorks.resolve({ works: [{ id: 'old' } as CommunityWork], page: 1, pageSize: 20, hasMore: true })
  oldTags.resolve({ tags: [{ tag: '旧标签', count: 1 }] })
  await Promise.all([a, b])
  expect(store.works).toEqual([])
  expect(store.availableTags).toEqual([{ tag: '提示词', count: 1 }])
  expect(store.hasMore).toBe(false)
})

it('社区加载更多失败保留列表和页码，重试不会跳页或重复', async () => {
  const work = { id: 'one' } as CommunityWork
  vi.mocked(listCommunityWorks).mockResolvedValueOnce({ works: [work], page: 1, pageSize: 20, hasMore: true })
    .mockRejectedValueOnce(new Error('断网'))
    .mockResolvedValueOnce({ works: [work, { id: 'two' } as CommunityWork], page: 2, pageSize: 20, hasMore: false })
  const store = useCommunityCatalogStore()
  await store.loadWorks()
  await store.loadWorks(true)
  expect(store.works).toEqual([work])
  expect(store.error).toContain('断网')
  await store.loadWorks(true)
  expect(vi.mocked(listCommunityWorks).mock.calls[2][0]?.page).toBe(2)
  expect(store.works.map(item => item.id)).toEqual(['one', 'two'])
})

it('输入搜索词时取消旧请求，防抖期间不会渲染旧搜索结果', async () => {
  const old = deferred<Awaited<ReturnType<typeof listCommunityWorks>>>()
  vi.mocked(listCommunityWorks).mockReturnValueOnce(old.promise)
  const store = useCommunityCatalogStore()
  const request = store.loadWorks()
  store.search = '新的搜索'
  store.cancel()
  old.resolve({ works: [{ id: 'old' } as CommunityWork], page: 1, pageSize: 20, hasMore: true })
  await request
  expect(store.works).toEqual([])
  expect(store.loading).toBe(false)
})
