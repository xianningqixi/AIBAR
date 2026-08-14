import type { Character, ChatPersonaSnapshot } from '@/api/types'

// 聊天 JSONL metadata 里 aibar 键的编解码。全部是纯函数：入参出参都是普通对象，
// 由 chat store 负责把结果写回响应式状态并持久化。

export type ChatMemoryState = {
  summary: string
  updatedAt: string
  messageCount: number
}

export function getMetadataAibar(metadata: Record<string, unknown>): Record<string, unknown> {
  return metadata.aibar && typeof metadata.aibar === 'object'
    ? (metadata.aibar as Record<string, unknown>)
    : {}
}

/** 返回合并了 aibar 增量后的新 metadata 对象（不修改入参）。 */
export function mergeMetadataAibar(
  metadata: Record<string, unknown>,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...metadata,
    aibar: { ...getMetadataAibar(metadata), ...updates },
  }
}

export function getMetadataProfileId(metadata: Record<string, unknown>): string {
  const v = getMetadataAibar(metadata).profileId
  return v === undefined || v === null ? '' : String(v)
}

export function getMetadataPresetId(metadata: Record<string, unknown>): string {
  const v = getMetadataAibar(metadata).presetId
  return typeof v === 'string' ? v : ''
}

export function getMetadataWorld(metadata: Record<string, unknown>): string {
  const v = getMetadataAibar(metadata).world
  return typeof v === 'string' ? v : ''
}

export function getMetadataModIds(metadata: Record<string, unknown>): string[] {
  const v = getMetadataAibar(metadata).mods
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function getMetadataPersona(metadata: Record<string, unknown>): ChatPersonaSnapshot | null {
  const value = getMetadataAibar(metadata).persona
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const name = typeof data.name === 'string' ? data.name.trim() : ''
  if (!name) return null
  return {
    id: typeof data.id === 'string' ? data.id : '',
    name,
    description: typeof data.description === 'string' ? data.description : '',
  }
}

export function getMemoryState(metadata: Record<string, unknown>): ChatMemoryState {
  const memory = getMetadataAibar(metadata).memory
  if (!memory || typeof memory !== 'object') {
    return { summary: '', updatedAt: '', messageCount: 0 }
  }
  const data = memory as Record<string, unknown>
  return {
    summary: typeof data.summary === 'string' ? data.summary : '',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    messageCount: typeof data.messageCount === 'number' ? data.messageCount : 0,
  }
}

/**
 * 把故事发布时写入 metadata 的标题/简介/场景/system 追加叠加到角色卡上，
 * 返回生成时实际使用的角色；没有故事字段时原样返回。
 */
export function applyStoryOverlay(
  character: Character,
  aibar: Record<string, unknown>,
): Character {
  const storyParts = [
    typeof aibar.storyTitle === 'string' && aibar.storyTitle ? `故事标题：${aibar.storyTitle}` : '',
    typeof aibar.storySummary === 'string' && aibar.storySummary ? `故事简介：${aibar.storySummary}` : '',
    typeof aibar.storyScenario === 'string' && aibar.storyScenario ? `故事场景：${aibar.storyScenario}` : '',
  ].filter(Boolean)
  const storySystemAppend =
    typeof aibar.storySystemAppend === 'string' ? aibar.storySystemAppend.trim() : ''

  if (!storyParts.length && !storySystemAppend) return character

  const data = character.data || { name: character.name }
  const scenario = [data.scenario || character.scenario || '', ...storyParts]
    .filter(Boolean)
    .join('\n\n')
  const systemPrompt = [data.system_prompt || '', storySystemAppend]
    .filter(Boolean)
    .join('\n\n')

  return {
    ...character,
    scenario,
    data: {
      ...data,
      scenario,
      system_prompt: systemPrompt,
    },
  }
}
