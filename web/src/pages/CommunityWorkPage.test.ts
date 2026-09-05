// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'

vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ replace: replaceRoute, push: vi.fn() }) }))
vi.mock('@/stores/ui', () => ({ useUiStore: () => ({ addToast: vi.fn() }) }))
vi.mock('@/api/community', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/community')>(),
  getCommunityWork: vi.fn(),
  setCommunityFavorite: vi.fn(),
}))
import { getCommunityWork, setCommunityFavorite, type CommunityWorkDetail } from '@/api/community'
import { useSessionStore } from '@/stores/session'
import CommunityWorkPage from './CommunityWorkPage.vue'

const route = reactive({ params: { id: 'A' } })
const replaceRoute = vi.fn()
let wrapper: VueWrapper | undefined

function work(id: string): CommunityWorkDetail {
  return { id, title: `作品 ${id}`, type: 'mod', authorHandle: 'author', authorName: '作者', ratingAverage: 0, myRating: 0, comments: [], versions: [], tags: [], favorite: false, favoriteCount: 0 } as unknown as CommunityWorkDetail
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetAllMocks()
  route.params.id = 'A'
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().user = { handle: 'reader', name: '读者', admin: false } as ReturnType<typeof useSessionStore>['user']
})
afterEach(() => wrapper?.unmount())

it('作品参数变化时重新加载，并丢弃上一个作品的迟到响应', async () => {
  const previous = deferred<CommunityWorkDetail>()
  vi.mocked(getCommunityWork).mockReturnValueOnce(previous.promise).mockResolvedValueOnce(work('B'))
  wrapper = shallowMount(CommunityWorkPage, { global: { renderStubDefaultSlot: true } })
  route.params.id = 'B'
  await flushPromises()
  expect(getCommunityWork).toHaveBeenLastCalledWith('B')
  previous.resolve(work('A'))
  await flushPromises()
  expect(wrapper.find('h1').text()).toBe('作品 B')
})

it('旧作品的收藏结果不能覆盖新作品', async () => {
  const favorite = deferred<Awaited<ReturnType<typeof setCommunityFavorite>>>()
  vi.mocked(getCommunityWork).mockResolvedValueOnce(work('A')).mockResolvedValueOnce(work('B'))
  vi.mocked(setCommunityFavorite).mockReturnValueOnce(favorite.promise)
  wrapper = shallowMount(CommunityWorkPage, { global: { renderStubDefaultSlot: true } })
  await flushPromises()
  await wrapper.findAllComponents({ name: 'AppButton' }).find(button => button.text().includes('收藏'))!.vm.$emit('click')
  expect(setCommunityFavorite).toHaveBeenCalledWith('A', true)
  route.params.id = 'B'
  await flushPromises()
  favorite.resolve({ ...work('A'), favorite: true })
  await flushPromises()
  expect(wrapper.find('h1').text()).toBe('作品 B')
})

it('离开作品页后，旧请求失败不会把用户跳回社区', async () => {
  const previous = deferred<CommunityWorkDetail>()
  vi.mocked(getCommunityWork).mockReturnValueOnce(previous.promise)
  wrapper = shallowMount(CommunityWorkPage)
  wrapper.unmount()
  wrapper = undefined
  previous.reject(new Error('old request failed'))
  await flushPromises()
  expect(replaceRoute).not.toHaveBeenCalled()
})
