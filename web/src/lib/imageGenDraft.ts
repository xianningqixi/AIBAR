import type { Character, ImageGenSettings, ModelProfile } from '@/api/types'
import { buildChatCompletionPayload } from './buildPayload'

export interface ImageGenDraft {
  prompt: string
  negativePrompt: string
  width: number
  height: number
  steps: number
  scale: number
  sampler: string
  openaiSize: string
  promptPrefix: string
  enhance: boolean
  reason: string
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function asImageDimension(value: unknown, fallback: number): number {
  const clamped = asNumber(value, fallback, 512, 1536)
  return Math.min(1536, Math.max(512, Math.round(clamped / 64) * 64))
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function parseJsonObject(text: string): Record<string, unknown> {
  let body = text.trim()
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) body = fence[1].trim()

  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('模型没有返回可解析的 JSON')
  }

  return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>
}

function normalizeOpenAiSize(value: unknown, fallback: string): string {
  const raw = asString(value)
  return ['1024x1024', '1024x1792', '1792x1024'].includes(raw) ? raw : fallback
}

export function buildImageGenDraftPayload(
  profile: ModelProfile,
  description: string,
  settings: ImageGenSettings,
  contextType: string,
): Record<string, unknown> {
  const helperCharacter: Character = {
    name: 'AIBAR 生图导演',
    avatar: 'image-director',
    data: { name: 'AIBAR 生图导演' },
  }

  const systemPrompt = [
    '你是 AIBAR 的文生图参数助手。用户只会描述想要的画面，你需要把它整理成可直接用于文生图的专业参数。',
    '只返回一个 JSON 对象，不要 Markdown，不要解释。',
    'prompt 使用英文，适合当前场景的成图模型；保留关键人物、动作、环境、构图、光线、镜头、风格，不要加入违背用户意图的内容。',
    'negativePrompt 使用英文，排除低质量、畸形、文字水印、糟糕构图等常见问题。',
    'width/height 必须是 64 的倍数，范围 512 到 1536。故事封面和角色图优先竖图，聊天配图可按场景选择横图/方图。',
    'steps 建议 20 到 36；scale 建议 5 到 9；sampler 给常见 Stable Diffusion 采样器名。',
    'OpenAI Images 只需要 openaiSize，在 1024x1024、1024x1792、1792x1024 里选一个。',
    'promptPrefix 是短的质量/风格前缀，可为空；不要把完整 prompt 重复放入 promptPrefix。',
    'reason 用中文，用一句话说明你为什么选择这些关键参数。',
    'JSON schema: {"prompt":"","negativePrompt":"","width":768,"height":1024,"steps":28,"scale":7,"sampler":"DPM++ 2M Karras","openaiSize":"1024x1024","promptPrefix":"high quality, detailed","enhance":false,"reason":""}',
  ].join('\n')

  const userPrompt = [
    `用户描述：${description}`,
    `用途：${contextType || 'image'}`,
    '当前图像配置：',
    JSON.stringify({
      provider: settings.provider,
      model: settings.model,
      width: settings.width,
      height: settings.height,
      steps: settings.steps,
      scale: settings.scale,
      sampler: settings.sampler,
      openaiSize: settings.openaiSize,
      promptPrefix: settings.promptPrefix,
      negativePrompt: settings.negativePrompt,
      enhance: settings.enhance,
    }, null, 2),
  ].join('\n\n')

  return buildChatCompletionPayload(
    {
      ...profile,
      temperature: Math.min(profile.temperature || 0.7, 0.7),
      maxTokens: Math.max(900, Math.min(profile.maxTokens || 1600, 2400)),
    },
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    helperCharacter,
  )
}

export function parseImageGenDraft(text: string, fallback: ImageGenSettings): ImageGenDraft {
  const raw = parseJsonObject(text)
  return {
    prompt: asString(raw.prompt),
    negativePrompt: asString(raw.negativePrompt) || fallback.negativePrompt,
    width: asImageDimension(raw.width, fallback.width),
    height: asImageDimension(raw.height, fallback.height),
    steps: asNumber(raw.steps, fallback.steps, 1, 80),
    scale: asNumber(raw.scale, fallback.scale, 1, 30),
    sampler: asString(raw.sampler) || fallback.sampler,
    openaiSize: normalizeOpenAiSize(raw.openaiSize, fallback.openaiSize),
    promptPrefix: asString(raw.promptPrefix),
    enhance: asBoolean(raw.enhance, fallback.enhance),
    reason: asString(raw.reason),
  }
}
