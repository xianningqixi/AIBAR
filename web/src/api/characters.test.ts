import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./client', () => ({ apiPost: vi.fn(), apiPostForm: vi.fn(), apiPostBlob: vi.fn() }))
import { apiPost } from './client'
import { fetchCharacter, fetchCharacters, toggleFavorite } from './characters'
beforeEach(() => vi.resetAllMocks())
it('列表兼容布尔值、旧字符串和扩展字段里的收藏状态', async () => {
  vi.mocked(apiPost).mockResolvedValue([
    { name: 'A', fav: true }, { name: 'B', fav: 'true' }, { name: 'C', fav: false },
    { name: 'D', data: { extensions: { fav: true } } },
  ])
  expect((await fetchCharacters()).map(c => c.fav)).toEqual(['true', 'true', 'false', 'true'])
})
it('已收藏卡片打开详情后，点击收藏会真正取消收藏', async () => {
  vi.mocked(apiPost).mockResolvedValueOnce({ name: 'A', avatar: 'a.png', fav: true }).mockResolvedValueOnce({})
  const character = await fetchCharacter('a.png')
  expect(await toggleFavorite(character)).toBe(false)
  expect(apiPost).toHaveBeenLastCalledWith('/api/characters/merge-attributes', expect.objectContaining({ fav: 'false' }))
})
