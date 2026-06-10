import { ref } from 'vue'
import { listImageAssets } from '@/api/imageGen'
import { listWorldInfo } from '@/api/worldinfo'
import type { ImageAsset, WorldInfoSummary } from '@/api/types'

// 跨标签页共享的世界书列表（设置页头部统计 + 世界书标签页共用）
export const worlds = ref<WorldInfoSummary[]>([])

// 跨标签页共享的本地图片库（设置页头部统计 + 图像标签页共用）
export const imageHistory = ref<ImageAsset[]>([])

export async function refreshWorldList() {
  worlds.value = await listWorldInfo()
}

export async function loadImageHistory() {
  imageHistory.value = await listImageAssets().catch(() => [])
}
