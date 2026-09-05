/**
 * 并发受限地执行批量异步任务：任何一项失败都不会中断其他项。
 * 与 Promise.all 不同，它总是等全部 settle，返回与输入同序的结果数组，
 * 适合“批量导入、单项失败互不影响”的场景（角色卡导入、批量发布）。
 */
export type SettledResult<R> =
  | { ok: true; value: R }
  | { ok: false; error: unknown }

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
  onSettled?: (done: number, total: number) => void,
): Promise<Array<SettledResult<R>>> {
  const results = new Array<SettledResult<R>>(items.length)
  const safeLimit = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 1
  const workerCount = Math.max(1, Math.min(safeLimit, items.length))
  let nextIndex = 0
  let done = 0

  async function worker() {
    for (;;) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      try {
        results[index] = { ok: true, value: await task(items[index], index) }
      } catch (error) {
        results[index] = { ok: false, error }
      }
      done += 1
      onSettled?.(done, items.length)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker))
  return results
}
