import { describe, expect, it } from 'vitest'
import { mapLimit } from './mapLimit'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

describe('mapLimit', () => {
  it('按输入顺序返回结果', async () => {
    const result = await mapLimit([30, 10, 20], 3, async (n) => {
      await new Promise((r) => setTimeout(r, n))
      return n * 2
    })
    expect(result).toEqual([
      { ok: true, value: 60 },
      { ok: true, value: 20 },
      { ok: true, value: 40 },
    ])
  })

  it('限制同时在途的任务数', async () => {
    let inflight = 0
    let peak = 0
    await mapLimit(Array.from({ length: 8 }, (_, i) => i), 3, async (n) => {
      inflight += 1
      peak = Math.max(peak, inflight)
      await new Promise((r) => setTimeout(r, 5 + (n % 3)))
      inflight -= 1
      return n
    })
    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBeGreaterThan(1)
  })

  it('单项失败不影响其他任务并按位置记录错误', async () => {
    const result = await mapLimit(['a', 'bad', 'b'], 2, async (item) => {
      if (item === 'bad') throw new Error('boom')
      return item.toUpperCase()
    })
    expect(result[0]).toEqual({ ok: true, value: 'A' })
    expect(result[1].ok).toBe(false)
    expect((result[1] as { error: Error }).error.message).toBe('boom')
    expect(result[2]).toEqual({ ok: true, value: 'B' })
  })

  it('onSettled 回调汇报进度且最终 done 等于总数', async () => {
    const progress: Array<{ done: number; total: number }> = []
    await mapLimit([1, 2, 3], 2, async (n) => n, (done, total) => {
      progress.push({ done, total })
    })
    expect(progress.length).toBe(3)
    expect(progress[0].total).toBe(3)
    expect(progress[progress.length - 1]).toEqual({ done: 3, total: 3 })
  })

  it('空输入直接返回空数组且不执行任务', async () => {
    let called = 0
    const result = await mapLimit([], 3, async (n) => {
      called += 1
      return n
    })
    expect(result).toEqual([])
    expect(called).toBe(0)
  })

  it('limit 非法时退化为单并发', async () => {
    let inflight = 0
    let peak = 0
    await mapLimit([1, 2, 3], Number.NaN, async (n) => {
      inflight += 1
      peak = Math.max(peak, inflight)
      await new Promise((r) => setTimeout(r, 2))
      inflight -= 1
      return n
    })
    expect(peak).toBe(1)
  })

  it('任务数少于 limit 时只启动等量的 worker', async () => {
    const gate = deferred()
    // 2 项任务、limit 8：第一项卡在 gate，第二项必须仍能启动（worker 数 = min(8,2)）
    const result = await Promise.all([
      mapLimit(['x', 'y'], 8, async (item) => {
        if (item === 'x') await gate.promise
        return item
      }),
      (async () => {
        await new Promise((r) => setTimeout(r, 10))
        gate.resolve()
        return null
      })(),
    ])
    expect(result[0]).toEqual([
      { ok: true, value: 'x' },
      { ok: true, value: 'y' },
    ])
  })
})
