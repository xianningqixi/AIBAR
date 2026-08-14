import { apiPostBlob, ApiError } from './client'
import type { TtsProvider } from './types'
import { PROVIDER_LABEL, TTS_PROVIDERS, type ExtraValue } from '@/lib/ttsProviders'

// 静态 provider 元数据已迁到 lib 层；这里 re-export 以保持旧 import 路径兼容
export {
  PROVIDER_LABEL,
  PROVIDER_MODELS,
  PROVIDER_VOICES,
  TTS_PROVIDERS,
} from '@/lib/ttsProviders'
export type {
  ExtraValue,
  ProviderExtraField,
  ProviderMeta,
  ProviderSecret,
} from '@/lib/ttsProviders'

export interface SynthesizeOptions {
  text: string
  provider: TtsProvider
  model: string
  voice: string
  endpoint?: string
  extra?: Record<string, ExtraValue>
}

function wrapError(provider: TtsProvider, err: unknown): Error {
  if (err instanceof ApiError) {
    const label = PROVIDER_LABEL[provider]
    if (err.status === 400 || err.status === 403) {
      return new Error(`${label} 未配置必要 Key/参数,请检查下方配置`)
    }
    const detail = err.message?.replace(/\s+/g, ' ').slice(0, 200)
    return new Error(`${label} TTS 调用失败 (${err.status})${detail ? `: ${detail}` : ''}`)
  }
  return err instanceof Error ? err : new Error(String(err))
}

function requireText(value: string | undefined, message: string): string {
  const text = value?.trim()
  if (!text) throw new Error(message)
  return text
}

function numberExtra(opts: SynthesizeOptions, key: string, fallback: number): number {
  const raw = opts.extra?.[key]
  const num = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(num) ? num : fallback
}

function stringExtra(opts: SynthesizeOptions, key: string): string {
  const raw = opts.extra?.[key]
  return typeof raw === 'string' ? raw.trim() : ''
}

function unsupported(provider: TtsProvider): never {
  const meta = TTS_PROVIDERS.find((p) => p.id === provider)
  throw new Error(`${meta?.label || provider} ${meta?.unavailableReason || '暂未接入简易页测试'}`)
}

export async function synthesizeSpeech(opts: SynthesizeOptions): Promise<Blob> {
  try {
    switch (opts.provider) {
      case 'openai':
        return await apiPostBlob('/api/openai/generate-voice', {
          text: opts.text,
          model: opts.model || 'tts-1',
          voice: opts.voice || 'alloy',
          speed: numberExtra(opts, 'speed', 1),
        })
      case 'electronhub':
        return await apiPostBlob('/api/openai/electronhub/generate-voice', {
          input: opts.text,
          model: opts.model || 'tts-1',
          voice: opts.voice || 'alloy',
          speed: numberExtra(opts, 'speed', 1),
          temperature: numberExtra(opts, 'temperature', 1),
          ...(opts.extra || {}),
        })
      case 'chutes':
        return await apiPostBlob('/api/openai/chutes/generate-voice', {
          input: opts.text,
          voice: opts.voice || 'af_heart',
          speed: numberExtra(opts, 'speed', 1),
        })
      case 'custom':
        return await apiPostBlob('/api/openai/custom/generate-voice', {
          input: opts.text,
          provider_endpoint: requireText(opts.endpoint, 'OpenAI Compatible 端点未配置'),
          model: opts.model || 'tts-1',
          voice: opts.voice || 'alloy',
          response_format: 'mp3',
          speed: numberExtra(opts, 'speed', 1),
        })
      case 'google_translate':
        return await apiPostBlob('/api/google/generate-voice', {
          text: opts.text,
          voice: opts.voice || 'zh-cn',
        })
      case 'google_native':
        return await apiPostBlob('/api/google/generate-native-tts', {
          text: opts.text,
          model: opts.model || 'gemini-2.5-flash-preview-tts',
          voice: opts.voice || 'Zephyr',
        })
      case 'azure':
        return await apiPostBlob('/api/azure/generate', {
          text: opts.text,
          voice: opts.voice || 'zh-CN-XiaoxiaoNeural',
          region: requireText(opts.endpoint, 'Azure Region 未配置'),
        })
      case 'elevenlabs':
        return await apiPostBlob('/api/speech/elevenlabs/synthesize', {
          voiceId: requireText(opts.voice, 'ElevenLabs Voice ID 未配置'),
          request: {
            text: opts.text,
            model_id: opts.model || 'eleven_multilingual_v2',
          },
        })
      case 'minimax':
        return await apiPostBlob('/api/minimax/generate-voice', {
          text: opts.text,
          voiceId: opts.voice || 'Chinese (Mandarin)_Unrestrained_Young_Man',
          apiHost: opts.endpoint || 'https://api.minimax.io',
          model: opts.model || 'speech-02-hd',
        })
      case 'novel':
        return await apiPostBlob('/api/novelai/generate-voice', {
          text: opts.text,
          voice: opts.voice || 'Aini',
        })
      case 'pollinations':
        return await apiPostBlob('/api/speech/pollinations/generate', {
          text: `Say exactly this and nothing else:\n${opts.text}`,
          model: opts.model || 'openai-audio',
          voice: opts.voice || 'alloy',
        })
      case 'volcengine':
        return await apiPostBlob('/api/volcengine/generate-voice', {
          text: opts.text,
          voice_speaker: opts.voice || 'zh_female_xiaohe_uranus_bigtts',
          resource_id: requireText(String(opts.extra?.resource_id || ''), 'Volcengine Resource ID 未配置'),
          provider_endpoint: opts.endpoint || 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
          speed: numberExtra(opts, 'speed', 0),
        })
      case 'mimo':
        return await apiPostBlob('/api/openai/mimo/generate-voice', {
          text: opts.text,
          model: opts.model || 'mimo-v2.5-tts',
          voice: opts.voice || '冰糖',
          style_prompt: stringExtra(opts, 'style_prompt'),
          format: 'wav',
        })
      case 'alltalk':
      case 'chatterbox':
      case 'coqui':
      case 'cosyvoice':
      case 'edge':
      case 'gsvi':
      case 'gpt_sovits_adapter':
      case 'gpt_sovits_v2':
      case 'kokoro':
      case 'sbvits2':
      case 'silero':
      case 'speecht5':
      case 'system':
      case 'tts_webui':
      case 'vits':
      case 'xttsv2':
        return unsupported(opts.provider)
      default: {
        const _exhaustive: never = opts.provider
        throw new Error(`Unknown TTS provider: ${_exhaustive}`)
      }
    }
  } catch (e) {
    throw wrapError(opts.provider, e)
  }
}
