import type { ModelProfile } from '@/api/types'

export function formatPoints(value: number): string {
  return Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  })
}

export function formatModelPricing(profile: ModelProfile): string {
  return `输入 ${formatPoints(profile.inputPrice || 0)} / 输出 ${formatPoints(profile.outputPrice || 0)} 积分/token`
}
