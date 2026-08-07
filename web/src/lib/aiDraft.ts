import type { Character, ModelProfile } from '@/api/types'
import { buildChatCompletionPayload } from './buildPayload'
import { parseJsonObject } from './llmJson'

export interface CharacterDraft {
  ch_name: string
  description: string
  personality: string
  scenario: string
  first_mes: string
  mes_example: string
  creator_notes: string
  tags: string[]
  system_prompt: string
  post_history_instructions: string
  alternate_greetings: string[]
}

export interface StoryDraft {
  title: string
  summary: string
  scenario: string
  openingUserMessage: string
  openingAssistantMessage: string
  systemAppend: string
  tags: string[]
}

export interface DraftQuestion {
  id: string
  question: string
  hint: string
  options: string[]
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function buildDraftPayload(
  profile: ModelProfile,
  systemPrompt: string,
  userPrompt: string,
): Record<string, unknown> {
  const helperCharacter: Character = {
    name: 'AIBAR 创作助手',
    avatar: 'assistant',
    data: { name: 'AIBAR 创作助手' },
  }

  return buildChatCompletionPayload(
    {
      ...profile,
      maxTokens: Math.max(1200, Math.min(profile.maxTokens || 2400, 4096)),
    },
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    helperCharacter,
  )
}

function normalizeQuestionId(value: unknown, index: number): string {
  const raw = asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return raw || `q${index + 1}`
}

export function parseDraftQuestions(text: string): DraftQuestion[] {
  const raw = parseJsonObject<{ questions?: unknown }>(text)
  const list = Array.isArray(raw.questions) ? raw.questions : []
  return list
    .map((item, index) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return {
        id: normalizeQuestionId(record.id, index),
        question: asString(record.question),
        hint: asString(record.hint),
        options: asStringArray(record.options).slice(0, 5),
      }
    })
    .filter((item) => item.question)
    .slice(0, 6)
}

export function buildCharacterDraftQuestionsPayload(
  profile: ModelProfile,
  idea: string,
  currentForm: Record<string, unknown>,
): Record<string, unknown> {
  const systemPrompt = [
    '你是 AIBAR 的角色卡创作向导。你需要根据用户的粗略想法，提出能显著影响角色卡质量的澄清问题。',
    '只返回一个 JSON 对象，不要 Markdown，不要解释。',
    '问题要帮助用户控制方向，而不是要求填写所有字段。优先询问关系张力、互动目标、说话风格、边界/雷点、关键记忆或秘密。',
    '最多 5 个问题，每个问题给一个很短的 hint，以及 4 到 5 个可直接选择的 options。',
    '每个 options 都要是能直接作为用户回答的短句，选项之间要有明显差异，覆盖常见方向；不要包含“其他”。',
    'JSON schema: {"questions":[{"id":"tone","question":"","hint":"","options":["","","",""]}]}',
  ].join('\n')
  const userPrompt = [
    `用户想法：${idea}`,
    '当前角色表单：',
    JSON.stringify(currentForm, null, 2),
  ].join('\n\n')
  return buildDraftPayload(profile, systemPrompt, userPrompt)
}

export function buildCharacterDraftPayload(
  profile: ModelProfile,
  idea: string,
  currentForm: Record<string, unknown>,
  guidance = '',
): Record<string, unknown> {
  const systemPrompt = [
    '你是 AIBAR 的角色卡起草助手。你的任务是把用户的一句话想法扩展成可直接编辑的 SillyTavern 角色卡初稿。',
    '只返回一个 JSON 对象，不要 Markdown，不要解释。',
    '所有字段使用中文，内容要具体、有可玩性，避免空泛形容。',
    'description 写角色外貌、背景、关系和核心设定；personality 写稳定性格和行为模式；scenario 写当前互动情境。',
    'first_mes 是角色发出的第一条消息；mes_example 用 2 到 4 轮短对话展示口吻。',
    'system_prompt 和 post_history_instructions 保持简短，约束扮演方式即可。',
    'JSON schema: {"ch_name":"","description":"","personality":"","scenario":"","first_mes":"","mes_example":"","creator_notes":"","tags":[],"system_prompt":"","post_history_instructions":"","alternate_greetings":[]}',
  ].join('\n')
  const userPrompt = [
    `用户想法：${idea}`,
    guidance ? `用户对追问的回答：\n${guidance}` : '',
    '当前表单内容如下。若已有内容，请在此基础上补完和润色；若为空，请完整起草。',
    JSON.stringify(currentForm, null, 2),
  ].filter(Boolean).join('\n\n')
  return buildDraftPayload(profile, systemPrompt, userPrompt)
}

export function parseCharacterDraft(text: string): CharacterDraft {
  const raw = parseJsonObject<Record<string, unknown>>(text)
  return {
    ch_name: asString(raw.ch_name),
    description: asString(raw.description),
    personality: asString(raw.personality),
    scenario: asString(raw.scenario),
    first_mes: asString(raw.first_mes),
    mes_example: asString(raw.mes_example),
    creator_notes: asString(raw.creator_notes),
    tags: asStringArray(raw.tags),
    system_prompt: asString(raw.system_prompt),
    post_history_instructions: asString(raw.post_history_instructions),
    alternate_greetings: asStringArray(raw.alternate_greetings),
  }
}

export function buildStoryDraftPayload(
  profile: ModelProfile,
  idea: string,
  character: Character,
  currentForm: Record<string, unknown>,
  guidance = '',
): Record<string, unknown> {
  const characterContext = {
    name: character.name,
    description: character.description || character.data?.description || '',
    personality: character.personality || character.data?.personality || '',
    scenario: character.scenario || character.data?.scenario || '',
    first_mes: character.data?.first_mes || '',
    tags: character.tags || character.data?.tags || [],
  }
  const systemPrompt = [
    '你是 AIBAR 的故事卡起草助手。你的任务是基于指定角色和用户想法，生成可复用的互动故事模板。',
    '只返回一个 JSON 对象，不要 Markdown，不要解释。',
    '故事卡不是聊天记录，而是开局模板；scenario 写世界状态、冲突、目标、限制和可互动线索。',
    'openingUserMessage 是玩家第一条消息；openingAssistantMessage 是角色或旁白接住开场的第一条回应。',
    'systemAppend 只写必要玩法规则、叙事口吻和边界条件，不要重复场景正文。',
    'JSON schema: {"title":"","summary":"","scenario":"","openingUserMessage":"","openingAssistantMessage":"","systemAppend":"","tags":[]}',
  ].join('\n')
  const userPrompt = [
    `用户想法：${idea}`,
    guidance ? `用户对追问的回答：\n${guidance}` : '',
    '绑定角色：',
    JSON.stringify(characterContext, null, 2),
    '当前故事表单：',
    JSON.stringify(currentForm, null, 2),
  ].filter(Boolean).join('\n\n')
  return buildDraftPayload(profile, systemPrompt, userPrompt)
}

export function buildStoryDraftQuestionsPayload(
  profile: ModelProfile,
  idea: string,
  character: Character,
  currentForm: Record<string, unknown>,
): Record<string, unknown> {
  const characterContext = {
    name: character.name,
    description: character.description || character.data?.description || '',
    personality: character.personality || character.data?.personality || '',
    scenario: character.scenario || character.data?.scenario || '',
    first_mes: character.data?.first_mes || '',
    tags: character.tags || character.data?.tags || [],
  }
  const systemPrompt = [
    '你是 AIBAR 的故事卡创作向导。你需要根据用户想法和绑定角色，提出能影响故事模板方向的澄清问题。',
    '只返回一个 JSON 对象，不要 Markdown，不要解释。',
    '问题要帮助用户控制可玩性。优先询问开局冲突、玩家目标、角色隐瞒的信息、故事节奏、禁忌/边界、结局开放度。',
    '最多 5 个问题，每个问题给一个很短的 hint，以及 5 个可直接选择的 options。',
    '每个 options 都要是能直接作为用户回答的短句，选项之间要有明显差异，覆盖常见方向；不要包含“其他”。',
    'JSON schema: {"questions":[{"id":"conflict","question":"","hint":"","options":["","","","",""]}]}',
  ].join('\n')
  const userPrompt = [
    `用户想法：${idea}`,
    '绑定角色：',
    JSON.stringify(characterContext, null, 2),
    '当前故事表单：',
    JSON.stringify(currentForm, null, 2),
  ].join('\n\n')
  return buildDraftPayload(profile, systemPrompt, userPrompt)
}

export function parseStoryDraft(text: string): StoryDraft {
  const raw = parseJsonObject<Record<string, unknown>>(text)
  return {
    title: asString(raw.title),
    summary: asString(raw.summary),
    scenario: asString(raw.scenario),
    openingUserMessage: asString(raw.openingUserMessage),
    openingAssistantMessage: asString(raw.openingAssistantMessage),
    systemAppend: asString(raw.systemAppend),
    tags: asStringArray(raw.tags),
  }
}
