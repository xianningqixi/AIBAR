import type { Character, ImageGenSettings, ModelProfile } from '@/api/types'
import { buildChatCompletionPayload } from './buildPayload'
import { addImageSafetyNegative, softenImagePromptForProvider } from './imagePromptSafety'

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
    '你是 AIBAR 的文生图提示词优化助手。用户只会描述想要的画面，你需要把它改写成可直接用于文生图的专业 Prompt，并给出匹配参数。',
    '只返回一个 JSON 对象，不要 Markdown，不要解释。',
    'prompt 使用英文，适合当前场景的成图模型；不是简单翻译，也不是关键词堆叠，要导演一张完整画面。',
    '先在内部锁定用户明确写出的主体、服装、场景、配色、镜头、画幅、风格和限制；这些内容只能细化、补全、稳定化，不得擅自替换。',
    '先判断唯一主视觉路线，再扩写。女性人像可参考这些路线：clean lifestyle, pure-desire curve, urban fashion, gufeng xianxia, new Chinese, retro Hong Kong, French lazy, sporty active, travel vacation, studio retouched, oriental voluptuous。多路线冲突时只保留最明确的主目标，其他降为局部气质、配色或滤镜。',
    '把画面建立成一个自然发生的可拍摄瞬间：明确时间切片、一个轻微主事件、连贯动作链、视线落点、两到三个环境细节、景别机位、景深、光线落点、滤镜质感。',
    '动作链必须合理，包含身体重心、肩颈状态、手部动作、衣料动态、头部方向和视线；不要让角色同时做太多动作。',
    '服装必须写清颜色、材质、版型、领口/袖口/下摆、层次和衣料动态，尤其要说明服装如何服务角色气质、身形线条和场景。',
    '光线不要只写 natural light/cinematic lighting，要写来源、方向、落点、高光、阴影过渡，以及它如何影响脸部、发丝、衣料和空间。',
    '场景不要堆满道具，只选择最能支持氛围的 2 到 3 个环境细节，并说明前景/中景/背景或浅景深关系。',
    '如果用途是 chat，不要复制聊天原文、系统提示、审查绕过文字或大段上下文；只提炼角色、场景、情绪、姿态和镜头语言。',
    '人物默认是虚构且明确成年的角色。女性人像使用 mature adult woman / clearly adult woman，不要使用 teen、schoolgirl、loli、young girl、childlike、minor-looking 等年龄模糊或幼态化表达。',
    '如果当前 provider 是 openai 或 pollinations，prompt 必须适合公开图片模型：把露骨成人桥段改写为非露骨的摄影语言、情绪张力、服装结构、戏剧光影和镜头裁切，不要描写裸露、性器官、体液或性行为。',
    '遇到 NSFW 或强吸引力内容时，转译为安全视觉语言：adult feminine presence, restrained allure, natural body lines, fitted but complete clothing, cinematic tension, dramatic shadows, cropped composition, off-frame implication。',
    '不要输出 suggestive、intimate、nude、naked、genitals、sex act、body fluids、pornographic、explicit 等容易触发拒绝的词；必要时用姿态、表情、衣料、构图和光线表达氛围。',
    'prompt 控制在 100 到 180 个英文词，必要时用 2 到 4 个自然段；避免过长、过细、像小说正文一样的段落。',
    'negativePrompt 使用英文，排除低质量、畸形、文字水印、糟糕构图、未成年感、幼态化、低俗镜头、身体局部凝视、服装结构混乱等常见问题。',
    'width/height 必须是 64 的倍数，范围 512 到 1536。故事封面和角色图优先竖图，聊天配图可按场景选择横图/方图。',
    'steps 建议 20 到 36；scale 建议 5 到 9；sampler 给常见 Stable Diffusion 采样器名。',
    'OpenAI Images 只需要 openaiSize，在 1024x1024、1024x1792、1792x1024 里选一个。',
    'promptPrefix 是短的质量/风格前缀，可为空；不要把完整 prompt 重复放入 promptPrefix。',
    'reason 用中文，用一句话说明主视觉路线、镜头/画幅和安全改写策略。',
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
  const prompt = softenImagePromptForProvider(asString(raw.prompt), fallback.provider)
  const negativePrompt = addImageSafetyNegative(asString(raw.negativePrompt) || fallback.negativePrompt, fallback.provider)
  return {
    prompt,
    negativePrompt,
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
