import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAsyncAction } from './useAsyncAction'
import { useUiStore } from '@/stores/ui'
import { ApiError } from '@/api/client'

describe('useAsyncAction', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('runs the action, toggles loading, and returns the result', async () => {
    let observedLoading = false
    const { loading, run } = useAsyncAction(async (value: number) => {
      observedLoading = loading.value
      return value * 2
    })

    expect(loading.value).toBe(false)
    await expect(run(21)).resolves.toBe(42)
    expect(observedLoading).toBe(true)
    expect(loading.value).toBe(false)
    expect(useUiStore().toasts).toHaveLength(0)
  })

  it('toasts the prefixed error message and resolves undefined on failure', async () => {
    const { loading, run } = useAsyncAction(async () => {
      throw new ApiError(500, '服务器打盹了')
    }, { errorPrefix: '保存失败' })

    await expect(run()).resolves.toBeUndefined()
    expect(loading.value).toBe(false)
    const ui = useUiStore()
    expect(ui.toasts).toHaveLength(1)
    expect(ui.toasts[0].type).toBe('error')
    expect(ui.toasts[0].message).toBe('保存失败：服务器打盹了')
  })

  it('toasts the bare error message when no prefix is given', async () => {
    const { run } = useAsyncAction(async () => {
      throw new Error('boom')
    })
    await run()
    expect(useUiStore().toasts[0].message).toBe('boom')
  })

  it('shows the success toast after the action resolves', async () => {
    const { run } = useAsyncAction(async () => 'ok', { successMessage: '已保存' })
    await run()
    const ui = useUiStore()
    expect(ui.toasts).toHaveLength(1)
    expect(ui.toasts[0].type).toBe('success')
    expect(ui.toasts[0].message).toBe('已保存')
  })

  it('ignores re-entrant calls while a run is in flight', async () => {
    let calls = 0
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { loading, run } = useAsyncAction(async () => {
      calls += 1
      await gate
      return calls
    })

    const first = run()
    expect(loading.value).toBe(true)
    // 执行中重复触发：直接忽略，不排队也不报错
    await expect(run()).resolves.toBeUndefined()
    expect(calls).toBe(1)

    release()
    await expect(first).resolves.toBe(1)
    expect(loading.value).toBe(false)

    // 结束后可以再次执行
    await run()
    expect(calls).toBe(2)
  })
})
