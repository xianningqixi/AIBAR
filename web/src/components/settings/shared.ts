import { ref } from 'vue'
import { listImageAssets } from '@/api/imageGen'
import { listWorldInfo } from '@/api/worldInfo'
import type { ImageAsset, WorldInfoSummary } from '@/api/types'

// 跨标签页共享的世界书列表（设置页头部统计 + 世界书标签页共用）
export const worlds = ref<WorldInfoSummary[]>([])

// 跨标签页共享的本地图片库（设置页头部统计 + 图像标签页共用）
export const imageHistory = ref<ImageAsset[]>([])
let sharedStateGeneration = 0

export async function refreshWorldList() {
  const generation = sharedStateGeneration
  const result = await listWorldInfo()
  if (generation === sharedStateGeneration) worlds.value = result
}

export async function loadImageHistory() {
  const generation = sharedStateGeneration
  const result = await listImageAssets().catch(() => [])
  if (generation === sharedStateGeneration) imageHistory.value = result
}

export function clearSettingsSharedState() {
  sharedStateGeneration += 1
  worlds.value = []
  imageHistory.value = []
}
