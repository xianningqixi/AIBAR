import { ApiError, apiPost } from './client'
import type { ImageAsset, ImageGenProvider, ImageGenSettings } from './types'
import { softenImagePromptForProvider } from '@/lib/imagePromptSafety'

export interface ImageProviderMeta {
  id: ImageGenProvider
  label: string
  description: string
  defaultModel: string
  secretKey?: string
  secretLabel?: string
  endpoint?: string
}

export interface ImageGenerateRequest {
  prompt: string
  negativePrompt?: string
  contextType?: string
  contextId?: string
}

export interface ImageGenerateResult {
  image: string
  format: string
  provider: ImageGenProvider
  model: string
  prompt: string
  negativePrompt: string
  width: number
  height: number
  seed: number
}

export const IMAGE_PROVIDERS: ImageProviderMeta[] = [
  {
    id: 'auto',
    label: 'Stable Diffusion WebUI',
    description: '复用 ST 的 /api/sd/generate，适合本地 A1111 / Forge / SD.Next。',
    defaultModel: '',
    endpoint: '/api/sd/generate',
  },
  {
    id: 'openai',
    label: 'OpenAI Images',
    description: '复用 ST 的 OpenAI 图片接口，Key 保存到 ST secrets。',
    defaultModel: 'dall-e-3',
    secretKey: 'api_key_openai',
    secretLabel: 'OpenAI API Key',
    endpoint: '/api/openai/generate-image',
  },
  {
    id: 'novel',
    label: 'NovelAI Diffusion',
    description: '复用 ST 的 NovelAI 图片接口，适合二次元角色图。',
    defaultModel: 'nai-diffusion-3',
    secretKey: 'api_key_novel',
    secretLabel: 'NovelAI Token',
    endpoint: '/api/novelai/generate-image',
  },
  {
    id: 'horde',
    label: 'AI Horde',
    description: '复用 ST 的 Horde 图片生成；未配置 Key 时走匿名额度。',
    defaultModel: 'Deliberate',
    secretKey: 'api_key_horde',
    secretLabel: 'AI Horde API Key',
    endpoint: '/api/horde/generate-image',
  },
  {
    id: 'pollinations',
    label: 'Pollinations',
    description: '复用 ST 的 Pollinations 图片接口。',
    defaultModel: 'flux',
    secretKey: 'api_key_pollinations',
    secretLabel: 'Pollinations API Key',
    endpoint: '/api/sd/pollinations/generate',
  },
]

export const DEFAULT_IMAGE_SETTINGS: ImageGenSettings = {
  provider: 'auto',
  model: '',
  width: 768,
  height: 1024,
  steps: 28,
  scale: 7,
  sampler: 'DPM++ 2M Karras',
  seed: -1,
  promptPrefix: 'high quality, detailed, cinematic lighting',
  negativePrompt: 'low quality, blurry, bad anatomy, extra fingers, watermark, text',
  autoUrl: 'http://127.0.0.1:7860',
  autoAuth: '',
  openaiSize: '1024x1024',
  openaiBaseUrl: '',
  enhance: false,
}

export function getImageProviderMeta(provider: ImageGenProvider): ImageProviderMeta {
  return IMAGE_PROVIDERS.find((item) => item.id === provider) || IMAGE_PROVIDERS[0]
}

export function normalizeImageSettings(input: unknown): ImageGenSettings {
  const obj = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const provider = IMAGE_PROVIDERS.some((item) => item.id === obj.provider)
    ? obj.provider as ImageGenProvider
    : DEFAULT_IMAGE_SETTINGS.provider
  return {
    provider,
    model: typeof obj.model === 'string' ? obj.model : getImageProviderMeta(provider).defaultModel,
    width: normalizeNumber(obj.width, DEFAULT_IMAGE_SETTINGS.width, 256, 2048),
    height: normalizeNumber(obj.height, DEFAULT_IMAGE_SETTINGS.height, 256, 2048),
    steps: normalizeNumber(obj.steps, DEFAULT_IMAGE_SETTINGS.steps, 1, 80),
    scale: normalizeNumber(obj.scale, DEFAULT_IMAGE_SETTINGS.scale, 1, 30),
    sampler: typeof obj.sampler === 'string' ? obj.sampler : DEFAULT_IMAGE_SETTINGS.sampler,
    seed: normalizeNumber(obj.seed, DEFAULT_IMAGE_SETTINGS.seed, -1, 9999999999),
    promptPrefix: typeof obj.promptPrefix === 'string' ? obj.promptPrefix : DEFAULT_IMAGE_SETTINGS.promptPrefix,
    negativePrompt: typeof obj.negativePrompt === 'string' ? obj.negativePrompt : DEFAULT_IMAGE_SETTINGS.negativePrompt,
    autoUrl: typeof obj.autoUrl === 'string' ? obj.autoUrl : DEFAULT_IMAGE_SETTINGS.autoUrl,
    autoAuth: typeof obj.autoAuth === 'string' ? obj.autoAuth : DEFAULT_IMAGE_SETTINGS.autoAuth,
    openaiSize: typeof obj.openaiSize === 'string' ? obj.openaiSize : DEFAULT_IMAGE_SETTINGS.openaiSize,
    openaiBaseUrl: typeof obj.openaiBaseUrl === 'string' ? obj.openaiBaseUrl : DEFAULT_IMAGE_SETTINGS.openaiBaseUrl,
    enhance: typeof obj.enhance === 'boolean' ? obj.enhance : DEFAULT_IMAGE_SETTINGS.enhance,
  }
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function buildFinalPrompt(settings: ImageGenSettings, prompt: string): string {
  const raw = prompt.trim()
  const prefix = settings.promptPrefix.trim()
  if (!prefix) return raw
  if (prefix.includes('{prompt}')) return prefix.split('{prompt}').join(raw)
  return `${prefix}, ${raw}`
}

function openAiImageErrorMessage(error: unknown): string {
  const raw = error instanceof ApiError
    ? error.body
    : error instanceof Error
      ? error.message
      : String(error || '')
  let message = raw
  try {
    const parsed = JSON.parse(raw) as any
    message = parsed?.error?.message || parsed?.message || raw
  } catch {
    // Keep the original text when the provider returns a plain string.
  }

  if (/auth_unavailable|no auth available/i.test(message)) {
    return '图片中转没有可用的 OpenAI Images 授权，请换一个生图模型/渠道，或稍后重试'
  }
  if (/upstream did not return image output/i.test(message)) {
    return '图片中转没有返回图片，常见原因是提示词被上游拒绝或模型未产出图片；先点“优化提示词”再试'
  }
  if (/stream error|INTERNAL_ERROR|Bad Gateway|Service Unavailable/i.test(message)) {
    return '图片中转上游连接异常，请稍后重试，或换一个图片渠道'
  }
  return message ? `OpenAI 图片生成失败：${message}` : 'OpenAI 图片生成失败，请检查图片渠道配置'
}

export async function testImageProvider(settings: ImageGenSettings): Promise<void> {
  if (settings.provider !== 'auto') return
  await apiPost('/api/sd/ping', {
    url: settings.autoUrl,
    auth: settings.autoAuth,
  })
}

export async function generateImage(settings: ImageGenSettings, request: ImageGenerateRequest): Promise<ImageGenerateResult> {
  const prompt = softenImagePromptForProvider(buildFinalPrompt(settings, request.prompt), settings.provider)
  const negativePrompt = request.negativePrompt ?? settings.negativePrompt
  const model = settings.model || getImageProviderMeta(settings.provider).defaultModel
  const width = settings.width
  const height = settings.height
  const seed = settings.seed

  if (!request.prompt.trim()) {
    throw new Error('Prompt 不能为空')
  }

  switch (settings.provider) {
    case 'auto': {
      const data = await apiPost<any>('/api/sd/generate', {
        url: settings.autoUrl,
        auth: settings.autoAuth,
        prompt,
        negative_prompt: negativePrompt,
        width,
        height,
        steps: settings.steps,
        cfg_scale: settings.scale,
        sampler_name: settings.sampler,
        seed,
        batch_size: 1,
        n_iter: 1,
        override_settings: model ? { sd_model_checkpoint: model } : undefined,
      })
      const image = Array.isArray(data?.images) ? data.images[0] : ''
      if (!image) throw new Error('SD WebUI 没有返回图片')
      return { image, format: 'png', provider: settings.provider, model, prompt, negativePrompt, width, height, seed }
    }
    case 'openai': {
      let data: any
      try {
        data = await apiPost<any>('/api/openai/generate-image', {
          model,
          prompt,
          size: settings.openaiSize || `${width}x${height}`,
          n: 1,
          response_format: 'b64_json',
          reverse_proxy: settings.openaiBaseUrl.trim() || undefined,
        })
      } catch (error) {
        throw new Error(openAiImageErrorMessage(error))
      }
      const image = data?.data?.[0]?.b64_json
      if (!image) throw new Error('OpenAI 没有返回 base64 图片')
      const [w, h] = String(settings.openaiSize || '').split('x').map((item) => Number(item))
      return {
        image,
        format: 'png',
        provider: settings.provider,
        model,
        prompt,
        negativePrompt,
        width: Number.isFinite(w) ? w : width,
        height: Number.isFinite(h) ? h : height,
        seed,
      }
    }
    case 'novel': {
      const image = await apiPost<string>('/api/novelai/generate-image', {
        prompt,
        negative_prompt: negativePrompt,
        model,
        width,
        height,
        steps: settings.steps,
        scale: settings.scale,
        sampler: settings.sampler || 'k_dpmpp_2m',
        seed,
      })
      if (!image) throw new Error('NovelAI 没有返回图片')
      return { image, format: 'png', provider: settings.provider, model, prompt, negativePrompt, width, height, seed }
    }
    case 'horde': {
      const image = await apiPost<string>('/api/horde/generate-image', {
        prompt,
        negative_prompt: negativePrompt,
        model,
        width,
        height,
        steps: settings.steps,
        scale: settings.scale,
        sampler: settings.sampler || 'k_euler',
        seed,
        enable_hr: false,
        restore_faces: false,
        karras: true,
        clip_skip: 1,
        sanitize: false,
      })
      if (!image) throw new Error('AI Horde 没有返回图片')
      return { image, format: 'webp', provider: settings.provider, model, prompt, negativePrompt, width, height, seed }
    }
    case 'pollinations': {
      const data = await apiPost<any>('/api/sd/pollinations/generate', {
        prompt,
        negative_prompt: negativePrompt,
        model,
        width,
        height,
        seed,
        enhance: settings.enhance,
      })
      const image = data?.image
      if (!image) throw new Error('Pollinations 没有返回图片')
      return { image, format: data?.format || 'jpg', provider: settings.provider, model, prompt, negativePrompt, width, height, seed }
    }
    default: {
      const exhaustive: never = settings.provider
      throw new Error(`Unsupported image provider: ${exhaustive}`)
    }
  }
}

export async function saveGeneratedImage(
  result: ImageGenerateResult,
  request: ImageGenerateRequest,
): Promise<ImageAsset> {
  return apiPost<ImageAsset>('/api/aibar/images/save', {
    image: result.image,
    format: result.format,
    contextType: request.contextType,
    contextId: request.contextId,
    prompt: result.prompt,
    negativePrompt: result.negativePrompt,
    provider: result.provider,
    model: result.model,
    width: result.width,
    height: result.height,
    seed: result.seed,
  })
}

export async function listImageAssets(contextType?: string, contextId?: string): Promise<ImageAsset[]> {
  const result = await apiPost('/api/aibar/images/list', { contextType, contextId })
  return Array.isArray(result) ? result as ImageAsset[] : []
}

export async function deleteImageAsset(id: string): Promise<unknown> {
  return apiPost('/api/aibar/images/delete', { id })
}
