import { ref } from 'vue'
import { listImageAssets } from '@/api/imageGen'
import type { ImageAsset } from '@/api/types'

// 跨标签页共享的本地图片库（设置页头部统计 + 图像标签页共用）。
// 世界书列表已迁入 stores/worldInfo。
export const imageHistory = ref<ImageAsset[]>([])
let sharedStateGeneration = 0

export async function loadImageHistory() {
  const generation = sharedStateGeneration
  const result = await listImageAssets().catch(() => [])
  if (generation === sharedStateGeneration) imageHistory.value = result
}

export function clearSettingsSharedState() {
  sharedStateGeneration += 1
  imageHistory.value = []
}
