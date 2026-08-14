import { describe, expect, it } from 'vitest'
import { confirmDialog, dialogState, promptDialog, settleDialog } from './useDialog'

describe('useDialog', () => {
  it('confirm resolves true on settle(true) and false on settle(false)', async () => {
    const p1 = confirmDialog({ title: '删除？' })
    expect(dialogState.active?.options.title).toBe('删除？')
    settleDialog(true)
    await expect(p1).resolves.toBe(true)

    const p2 = confirmDialog({ title: '再来一次？' })
    settleDialog(false)
    await expect(p2).resolves.toBe(false)
    expect(dialogState.active).toBeNull()
  })

  it('prompt resolves the edited value, or null when cancelled', async () => {
    const p1 = promptDialog({ title: '名称', defaultValue: '副本' })
    expect(dialogState.active?.value).toBe('副本')
    dialogState.active!.value = '新名字'
    settleDialog(true)
    await expect(p1).resolves.toBe('新名字')

    const p2 = promptDialog({ title: '名称' })
    settleDialog(false)
    await expect(p2).resolves.toBeNull()
  })

  it('queues concurrent requests sequentially', async () => {
    const seen: string[] = []
    const p1 = confirmDialog({ title: '第一个' }).then((v) => { seen.push(`1:${v}`) })
    const p2 = promptDialog({ title: '第二个' }).then((v) => { seen.push(`2:${v}`) })

    expect(dialogState.active?.options.title).toBe('第一个')
    settleDialog(true)
    await p1
    expect(dialogState.active?.options.title).toBe('第二个')
    settleDialog(true)
    await p2
    expect(seen).toEqual(['1:true', '2:'])
    expect(dialogState.active).toBeNull()
    expect(dialogState.queue).toHaveLength(0)
  })
})
