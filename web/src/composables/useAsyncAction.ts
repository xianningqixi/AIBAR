// 封装页面里反复出现的「loading ref + try/catch + getApiErrorMessage + toast + finally 复位」骨架。
// 只做最常见的一种并发策略：执行中再次调用直接忽略（与各页面现有 disabled 按钮语义一致，避免重复提交）。

import { ref, type Ref } from 'vue'
import { getApiErrorMessage } from '@/api/client'
import { useUiStore } from '@/stores/ui'

export interface UseAsyncActionOptions {
  /** 失败 toast 的前缀，如「保存失败」会展示为「保存失败：<原因>」；不传则直接展示错误信息 */
  errorPrefix?: string
  /** action 正常完成后的成功 toast；action 内部提前 return 的分支也会触发，需要条件提示时请在 action 里自己 addToast */
  successMessage?: string
}

export interface UseAsyncAction<Args extends unknown[], R> {
  /** 执行状态，供按钮 disabled / 文案切换使用 */
  loading: Ref<boolean>
  /** 包装后的执行函数：失败被 toast 消化并返回 undefined，不再向外抛出 */
  run: (...args: Args) => Promise<R | undefined>
}

export function useAsyncAction<Args extends unknown[], R>(
  action: (...args: Args) => Promise<R>,
  options: UseAsyncActionOptions = {},
): UseAsyncAction<Args, R> {
  const loading = ref(false)
  const ui = useUiStore()

  async function run(...args: Args): Promise<R | undefined> {
    // 并发保护：上一次还没结束时直接忽略，防止重复提交
    if (loading.value) return undefined
    loading.value = true
    try {
      const result = await action(...args)
      if (options.successMessage) ui.addToast(options.successMessage, 'success')
      return result
    } catch (error: unknown) {
      const message = getApiErrorMessage(error)
      ui.addToast(options.errorPrefix ? `${options.errorPrefix}：${message}` : message, 'error')
      return undefined
    } finally {
      loading.value = false
    }
  }

  return { loading, run }
}
