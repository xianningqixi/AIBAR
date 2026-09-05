import { describe, expect, it } from 'vitest'
import { CARD_FILE_ACCEPT, cardFileExtension, isCardFile } from './cardFiles'

describe('cardFiles', () => {
  it('识别全部受支持的扩展名', () => {
    for (const ext of ['png', 'json', 'yaml', 'yml', 'charx', 'byaf']) {
      expect(isCardFile({ name: `卡片.${ext}` })).toBe(true)
    }
  })

  it('扩展名大小写不敏感', () => {
    expect(isCardFile({ name: 'Card.PNG' })).toBe(true)
    expect(cardFileExtension('card.CharX')).toBe('charx')
  })

  it('拒绝非卡体文件与无扩展名文件', () => {
    expect(isCardFile({ name: 'photo.jpg' })).toBe(false)
    expect(isCardFile({ name: 'archive.zip' })).toBe(false)
    expect(isCardFile({ name: 'README' })).toBe(false)
    expect(cardFileExtension('README')).toBe('')
    expect(cardFileExtension('dot.')).toBe('')
  })

  it('accept 字符串覆盖全部扩展名', () => {
    for (const ext of ['png', 'json', 'yaml', 'yml', 'charx', 'byaf']) {
      expect(CARD_FILE_ACCEPT).toContain(`.${ext}`)
    }
  })
})
