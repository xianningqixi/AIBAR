// 角色卡 / 故事卡的展示元数据助手。
// 之前 BrowsePage / CreatePage / CharacterManagerPage 各自内联实现，此处收敛。

import type { Character, StoryCard } from '../api/types'

/** 角色标签：优先顶层 tags（ST 主数据），退回卡内 data.tags */
export function getCharacterTags(c: Character): string[] {
  return c.tags?.length ? c.tags : c.data?.tags || []
}

/** 角色简介：优先顶层 description，退回卡内 data.description */
export function getCharacterDescription(c: Character): string {
  return c.description || c.data?.description || ''
}

/**
 * 角色封面缩略图 URL。
 * 必须走缩略图端点：原始角色卡 PNG 内嵌了完整卡片 JSON，单张常在 0.5-3 MB。
 */
export function characterCover(avatar: string | undefined): string {
  if (!avatar || avatar === 'none') return ''
  return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`
}

/** 故事卡封面：优先自定义封面图，退回关联角色的头像缩略图 */
export function storyThumbnail(story: StoryCard, character?: Character): string {
  if (story.coverImage) return story.coverImage
  return characterCover(character?.avatar)
}
