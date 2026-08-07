import { apiPostBlob, ApiError } from './client'
import type { TtsProvider } from './types'

type ExtraValue = string | number | boolean

export interface SynthesizeOptions {
  text: string
  provider: TtsProvider
  model: string
  voice: string
  endpoint?: string
  extra?: Record<string, ExtraValue>
}

export interface ProviderSecret {
  key: string
  label: string
  placeholder?: string
}

export interface ProviderExtraField {
  key: string
  label: string
  placeholder?: string
  type?: 'text' | 'number'
  defaultValue?: ExtraValue
}

export interface ProviderMeta {
  id: TtsProvider
  stName: string
  label: string
  description: string
  secretKeys?: ProviderSecret[]
  hasEndpoint?: boolean
  endpointLabel?: string
  endpointPlaceholder?: string
  defaultEndpoint?: string
  freeFormModel?: boolean
  freeFormVoice?: boolean
  playable: boolean
  unavailableReason?: string
  extraFields?: ProviderExtraField[]
}

const stOnly = '已保持在 ST 原版列表中；简易页暂未复刻该本地/浏览器 provider 的生成适配。'

export const TTS_PROVIDERS: ProviderMeta[] = [
  {
    id: 'alltalk',
    stName: 'AllTalk',
    label: 'AllTalk',
    description: 'AllTalk 本地 TTS 服务。',
    hasEndpoint: true,
    endpointLabel: '服务地址',
    endpointPlaceholder: 'http://127.0.0.1:7851',
    defaultEndpoint: 'http://127.0.0.1:7851',
    freeFormVoice: true,
    playable: false,
    unavailableReason: stOnly,
  },
  {
    id: 'azure',
    stName: 'Azure',
    label: 'Azure TTS',
    description: 'Azure Speech Service,复用 ST 的 /api/azure 代理。',
    secretKeys: [{ key: 'api_key_azure_tts', label: 'Azure TTS Key' }],
    hasEndpoint: true,
    endpointLabel: 'Region',
    endpointPlaceholder: 'eastus / westus / southeastasia',
    freeFormVoice: true,
    playable: true,
  },
  {
    id: 'chatterbox',
    stName: 'Chatterbox',
    label: 'Chatterbox',
    description: 'Chatterbox 本地服务。',
    hasEndpoint: true,
    endpointLabel: '服务地址',
    endpointPlaceholder: 'http://127.0.0.1:4123',
    freeFormVoice: true,
    playable: false,
    unavailableReason: stOnly,
  },
  {
    id: 'chutes',
    stName: 'Chutes',
    label: 'Chutes Kokoro',
    description: 'Chutes.ai Kokoro TTS,复用 ST 的 Chutes 接口。',
    secretKeys: [{ key: 'api_key_chutes', label: 'Chutes API Key' }],
    playable: true,
    extraFields: [{ key: 'speed', label: '语速', type: 'number', defaultValue: 1, placeholder: '1' }],
  },
  {
    id: 'coqui',
    stName: 'Coqui',
    label: 'Coqui',
    description: 'Coqui / XTTS 本地服务。',
    hasEndpoint: true,
    endpointLabel: '服务地址',
    endpointPlaceholder: 'http://127.0.0.1:5002',
    freeFormVoice: true,
    playable: false,
    unavailableReason: stOnly,
  },
  {
    id: 'cosyvoice',
    stName: 'CosyVoice (Unofficial)',
    label: 'CosyVoice',
    description: 'CosyVoice 非官方本地服务。',
    hasEndpoint: true,
    endpointLabel: '服务地址',
    endpointPlaceholder: 'http://127.0.0.1:9880',
    freeFormVoice: true,
    playable: false,
    unavailableReason: stOnly,
  },
  {
    id: 'edge',
    stName: 'Edge',
    label: 'Microsoft Edge TTS',
    description: 'Edge TTS,原版通过 Extras 或插件提供。',
    freeFormVoice: true,
    playable: false,
    unavailableReason: stOnly,
  },
  {
    id: 'elevenlabs',
    stName: 'ElevenLabs',
    label: 'ElevenLabs',
    description: 'ElevenLabs TTS,复用 ST 的 /api/speech/elevenlabs 代理。',
    secretKeys: [{ key: 'api_key_elevenlabs', label: 'ElevenLabs API Key' }],
    freeFormVoice: true,
    playable: true,
  },
  {
    id: 'electronhub',
    stName: 'Electron Hub',
    label: 'Electron Hub',
    description: 'ElectronHub 统一 TTS API,OpenAI 兼容并支持多模型。',
    secretKeys: [{ key: 'api_key_electronhub', label: 'ElectronHub API Key' }],
    freeFormModel: true,
    freeFormVoice: true,
    playable: true,
    extraFields: [
      { key: 'speed', label: '语速', type: 'number', defaultValue: 1, placeholder: '1' },
      { key: 'temperature', label: 'Temperature', type: 'number', defaultValue: 1, placeholder: '1' },
    ],
  },
  {
    id: 'google_translate',
    stName: 'Google Translate',
    label: 'Google Translate',
    description: 'Google Translate 免费 TTS,复用 ST 的 /api/google/generate-voice。',
    playable: true,
  },
  {
    id: 'google_native',
    stName: 'Google Gemini TTS',
    label: 'Google Gemini TTS',
    description: 'Gemini 原生音频输出,复用 ST 的 Google 代理。',
    secretKeys: [{ key: 'api_key_makersuite', label: 'Google AI Studio Key' }],
    playable: true,
  },
  {
    id: 'gsvi',
    stName: 'GSVI',
    label: 'GSVI',
    description: 'GSVI 本地 TTS 服务。',
    hasEndpoint: true,
    endpointLabel: '服务地址',
    endpointPlaceholder: 'http://127.0.0.1:5000',
    freeFormVoice: true,
    playable: false,
    unavailableReason: stOnly,
  },
  {
    id: 'gpt_sovits_adapter',
    stName: 'GPT-SoVITS-Adapter',
    label: 'GPT-SoVITS Adapter',
    description: 'GPT-SoVITS Adapter 本地服务。',
    hasEndpoint: true,
    endpointLabel: '服务地址',
    endpointPlaceholder: 'http://127.0.0.1:9880',
    freeFormVoice: true,
    playable: false,
    unavailableReason: stOnly,
  },
  {
    id: 'gpt_sovits_v2',
    stName: 'GPT-SoVITS-V2 (Unofficial)',
    label: 'GPT-SoVITS V2',
    description: 'GPT-SoVITS V2 非官方本地服务。',
    hasEndpoint: true,
    endpointLabel: '服务地址',
    endpointPlaceholder: 'http://127.0.0.1:9880',
    freeFormVoice: true,
    playable: false,
    unavailableReason: stOnly,
  },
  {
    id: 'kokoro',
    stName: 'Kokoro',
    label: 'Kokoro',
    description: '浏览器端 Kokoro TTS。',
    playable: false,
    unavailableReason: stOnly,
  },
  {
    id: 'minimax',
    stName: 'MiniMax',
    label: 'MiniMax',
    description: 'MiniMax TTS,复用 ST 的 /api/minimax 代理。',
    secretKeys: [
      { key: 'api_key_minimax', label: 'MiniMax API Key' },
      { key: 'minimax_group_id', label: 'MiniMax Group ID' },
    ],
    hasEndpoint: true,
    endpointLabel: 'API Host',
    endpointPlaceholder: 'https://api.minimax.io',
    defaultEndpoint: 'https://api.minimax.io',
    freeFormVoice: true,
    playable: true,
  },
  {
    id: 'novel',
    stName: 'Novel',
    label: 'NovelAI',
    description: 'NovelAI TTS,复用 ST 的 NovelAI Token。',
    secretKeys: [{ key: 'api_key_novel', label: 'NovelAI Token' }],
    freeFormVoice: true,
    playable: true,
  },
  {
    id: 'openai',
    stName: 'OpenAI',
    label: 'OpenAI',
    description: 'OpenAI TTS,复用 ST OpenAI Key。',
    secretKeys: [{ key: 'api_key_openai', label: 'OpenAI API Key' }],
    playable: true,
    extraFields: [{ key: 'speed', label: '语速', type: 'number', defaultValue: 1, placeholder: '1' }],
  },
  {
    id: 'custom',
    stName: 'OpenAI Compatible',
    label: 'OpenAI Compatible',
    description: '任意 OpenAI /v1/audio/speech 兼容端点。',
    secretKeys: [{ key: 'api_key_custom_openai_tts', label: '兼容端点 API Key' }],
    hasEndpoint: true,
    endpointLabel: 'Provider Endpoint',
    endpointPlaceholder: 'http://127.0.0.1:8000/v1/audio/speech',
    defaultEndpoint: 'http://127.0.0.1:8000/v1/audio/speech',
    freeFormModel: true,
    freeFormVoice: true,
    playable: true,
    extraFields: [{ key: 'speed', label: '语速', type: 'number', defaultValue: 1, placeholder: '1' }],
  },
  {
    id: 'pollinations',
    stName: 'Pollinations',
    label: 'Pollinations',
    description: 'Pollinations Audio,复用 ST 的 /api/speech/pollinations 代理。',
    secretKeys: [{ key: 'api_key_pollinations', label: 'Pollinations API Key' }],
    playable: true,
  },
  {
    id: 'sbvits2',
    stName: 'SBVits2',
    label: 'SBVits2',
    description: 'Style-Bert-VITS2 本地服务。',
    hasEndpoint: true,
    endpointLabel: '服务地址',
    endpointPlaceholder: 'http://127.0.0.1:5000',
    freeFormVoice: true,
    playable: false,
    unavailableReason: stOnly,
  },
  {
    id: 'silero',
    stName: 'Silero',
    label: 'Silero',
    description: 'Silero Extras TTS。',
    freeFormVoice: true,
    playable: false,
    unavailableReason: stOnly,
  },
  {
    id: 'speecht5',
    stName: 'SpeechT5',
    label: 'SpeechT5',
    description: 'Transformers SpeechT5 TTS。',
    freeFormVoice: true,
    playable: false,
    unavailableReason: stOnly,
  },
  {
    id: 'system',
    stName: 'System',
    label: 'System',
    description: '浏览器/操作系统语音合成。',
    playable: false,
    unavailableReason: 'System TTS 不能返回音频 Blob；需要单独接入浏览器 speechSynthesis 播放链路。',
  },
  {
    id: 'tts_webui',
    stName: 'TTS WebUI',
    label: 'TTS WebUI',
    description: 'TTS WebUI 本地服务。',
    hasEndpoint: true,
    endpointLabel: '服务地址',
    endpointPlaceholder: 'http://127.0.0.1:5000',
    freeFormVoice: true,
    playable: false,
    unavailableReason: stOnly,
  },
  {
    id: 'vits',
    stName: 'VITS',
    label: 'VITS',
    description: 'VITS 本地服务。',
    hasEndpoint: true,
    endpointLabel: '服务地址',
    endpointPlaceholder: 'http://127.0.0.1:23456',
    freeFormVoice: true,
    playable: false,
    unavailableReason: stOnly,
  },
  {
    id: 'xttsv2',
    stName: 'XTTSv2',
    label: 'XTTSv2',
    description: 'XTTSv2 本地服务。',
    hasEndpoint: true,
    endpointLabel: '服务地址',
    endpointPlaceholder: 'http://127.0.0.1:8020',
    freeFormVoice: true,
    playable: false,
    unavailableReason: stOnly,
  },
  {
    id: 'volcengine',
    stName: 'Volcengine',
    label: 'Volcengine / 豆包',
    description: '火山引擎 TTS,复用 ST 的 /api/volcengine 代理。',
    secretKeys: [
      { key: 'volcengine_app_id', label: 'Volcengine App ID' },
      { key: 'volcengine_access_key', label: 'Volcengine Access Key' },
    ],
    hasEndpoint: true,
    endpointLabel: 'Provider Endpoint',
    endpointPlaceholder: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
    defaultEndpoint: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
    playable: true,
    extraFields: [
      { key: 'resource_id', label: 'Resource ID', placeholder: 'volc.service_type.xxx' },
      { key: 'speed', label: '语速', type: 'number', defaultValue: 0, placeholder: '0' },
    ],
  },
  {
    id: 'mimo',
    stName: '小米 MiMo',
    label: '小米 MiMo',
    description: '小米 MiMo V2.5 TTS,使用音频输出 chat completions。',
    secretKeys: [{ key: 'api_key_mimo', label: 'MiMo API Key' }],
    playable: true,
    extraFields: [
      {
        key: 'style_prompt',
        label: '风格提示',
        placeholder: '可选：用自然语言描述音色、情绪、语速或角色感。',
      },
    ],
  },
]

export const PROVIDER_LABEL: Record<TtsProvider, string> = Object.fromEntries(
  TTS_PROVIDERS.map((p) => [p.id, p.label]),
) as Record<TtsProvider, string>

const openAiVoices = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer']
const kokoroVoices = [
  'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova',
  'af_river', 'af_sarah', 'af_sky', 'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam',
  'am_michael', 'am_onyx', 'am_puck', 'am_santa', 'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily',
  'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis', 'ef_dora', 'em_alex', 'em_santa', 'ff_siwis',
  'hf_alpha', 'hf_beta', 'hm_omega', 'hm_psi', 'if_sara', 'im_nicola', 'jf_alpha', 'jf_gongitsune',
  'jf_nezumi', 'jf_tebukuro', 'jm_kumo', 'pf_dora', 'pm_alex', 'pm_santa',
  'zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi',
  'zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang',
]
const geminiVoices = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirhoe', 'Autonoe',
  'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
  'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird',
  'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
]
const volcengineVoices = [
  'zh_female_xiaohe_uranus_bigtts',
  'zh_female_vv_uranus_bigtts',
  'saturn_zh_female_keainvsheng_tob',
  'saturn_zh_female_tiaopigongzhu_tob',
  'saturn_zh_female_cancan_tob',
  'saturn_zh_male_shuanglangshaonian_tob',
  'saturn_zh_male_tiancaitongzhuo_tob',
  'zh_male_taocheng_uranus_bigtts',
]

export const PROVIDER_MODELS: Record<TtsProvider, string[]> = {
  alltalk: [],
  azure: [],
  chatterbox: [],
  chutes: ['kokoro'],
  coqui: [],
  cosyvoice: [],
  edge: [],
  elevenlabs: ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'],
  electronhub: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'dia-1.6b', 'gemini-2.5-flash-preview-tts'],
  google_translate: [],
  google_native: ['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'],
  gsvi: [],
  gpt_sovits_adapter: [],
  gpt_sovits_v2: [],
  kokoro: ['onnx-community/Kokoro-82M-v1.0-ONNX'],
  minimax: ['speech-02-hd', 'speech-02-turbo', 'speech-01', 'speech-01-240228'],
  novel: [],
  openai: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'tts-1-1106', 'tts-1-hd-1106'],
  custom: ['tts-1'],
  pollinations: ['openai-audio'],
  sbvits2: [],
  silero: [],
  speecht5: ['Xenova/speecht5_tts'],
  system: [],
  tts_webui: [],
  vits: [],
  xttsv2: [],
  volcengine: [],
  mimo: ['mimo-v2.5-tts', 'mimo-v2.5-tts-voicedesign', 'mimo-v2.5-tts-voiceclone'],
}

export const PROVIDER_VOICES: Record<TtsProvider, string[]> = {
  alltalk: [],
  azure: ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural', 'en-US-JennyNeural', 'en-US-GuyNeural'],
  chatterbox: [],
  chutes: kokoroVoices,
  coqui: [],
  cosyvoice: [],
  edge: ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural', 'en-US-JennyNeural'],
  elevenlabs: ['21m00Tcm4TlvDq8ikWAM'],
  electronhub: openAiVoices,
  google_translate: ['zh-cn', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru'],
  google_native: geminiVoices,
  gsvi: [],
  gpt_sovits_adapter: [],
  gpt_sovits_v2: [],
  kokoro: kokoroVoices,
  minimax: ['Chinese (Mandarin)_Unrestrained_Young_Man'],
  novel: ['Aini', 'Ligeia', 'Orea'],
  openai: openAiVoices,
  custom: openAiVoices,
  pollinations: openAiVoices,
  sbvits2: [],
  silero: [],
  speecht5: ['default'],
  system: ['__browser_default__'],
  tts_webui: [],
  vits: [],
  xttsv2: [],
  volcengine: volcengineVoices,
  mimo: ['冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean', 'mimo_default'],
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
