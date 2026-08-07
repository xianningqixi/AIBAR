import { getApiErrorMessage } from '@/api/client'
import { useUiStore } from '@/stores/ui'

// 后端整体不可用时六个设置 store 可能同时失败，10 秒内只弹一条，避免刷屏。
let lastNotifiedAt = 0

export function notifyPersistFailure(domain: string, error: unknown): void {
  console.warn(`Persist ${domain} failed`, error)
  const now = Date.now()
  if (now - lastNotifiedAt < 10_000) return
  lastNotifiedAt = now
  useUiStore().addToast(`${domain}保存失败，更改可能不会保留：${getApiErrorMessage(error)}`, 'error', 6000)
}
