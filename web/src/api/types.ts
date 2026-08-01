export interface CharacterData {
  name: string
  description?: string
  personality?: string
  scenario?: string
  first_mes?: string
  mes_example?: string
  creator_notes?: string
  tags?: string[]
  creator?: string
  character_version?: string
  talkativeness?: string
  system_prompt?: string
  post_history_instructions?: string
  alternate_greetings?: string[]
  extensions?: Record<string, unknown>
  character_book?: unknown
  world?: string
}

export interface Character {
  name: string
  avatar: string
  chat?: string
  tags?: string[]
  description?: string
  personality?: string
  scenario?: string
  mes_example?: string
  data?: CharacterData
  create_date?: string
  date_added?: string
  date_last_chat?: number | string
  chat_size?: number
  data_size?: number
  fav?: string
  last_chat_date?: string
  chat_count?: number
  recent?: boolean
  shallow?: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  date?: string
  swipes?: string[]
  swipe_id?: number
  reasoning?: string
  images?: ImageAsset[]
  mes?: string
  name?: string
  is_user?: boolean
  is_system?: boolean
  chat_metadata?: Record<string, unknown>
}

export interface ChatEntry {
  file_name: string
  file_id?: string
  file_size?: string
  avatar?: string
  group?: string
  character_name?: string
  chat_items?: number
  mes?: string
  last_mes?: number | string
  chat_metadata?: Record<string, unknown>
}

export interface StoryCard {
  id: string
  version?: number
  title: string
  summary?: string
  characterAvatar: string
  coverImage?: string
  coverAssetId?: string
  tags?: string[]
  world?: string
  scenario?: string
  openingUserMessage?: string
  openingAssistantMessage?: string
  systemAppend?: string
  modIds?: string[]
  modelProfileId?: string
  createdAt?: string
  updatedAt?: string
}

export interface ModelProfile {
  id: string
  name: string
  source: string
  model: string
  endpoint?: string
  secretId?: string
  apiKeySaved?: boolean
  canManageCredentials?: boolean
  temperature: number
  maxTokens: number
  topP: number
  presencePenalty: number
  frequencyPenalty: number
  inputPrice?: number
  outputPrice?: number
  enabled?: boolean
  sortOrder?: number
  updatedAt?: string
}

export interface Preset {
  id: string
  name: string
  temperature: number
  topP: number
  maxTokens: number
  presencePenalty: number
  frequencyPenalty: number
  systemPrompt: string
}

export interface Persona {
  id: string
  name: string
  description: string
  avatar?: string
}

export type TtsProvider =
  | 'alltalk'
  | 'azure'
  | 'chatterbox'
  | 'chutes'
  | 'coqui'
  | 'cosyvoice'
  | 'edge'
  | 'elevenlabs'
  | 'electronhub'
  | 'google_translate'
  | 'google_native'
  | 'gsvi'
  | 'gpt_sovits_adapter'
  | 'gpt_sovits_v2'
  | 'kokoro'
  | 'minimax'
  | 'novel'
  | 'openai'
  | 'custom'
  | 'pollinations'
  | 'sbvits2'
  | 'silero'
  | 'speecht5'
  | 'system'
  | 'tts_webui'
  | 'vits'
  | 'xttsv2'
  | 'volcengine'
  | 'mimo'

export interface TtsProviderConfig {
  enabled: boolean
  model: string
  voice: string
  endpoint?: string
  extra?: Record<string, string | number | boolean>
  apiKeySaved?: boolean
}

export interface TtsCharacterVoice {
  provider: TtsProvider
  voice: string
}

export interface TtsVoiceProfile {
  id: string
  name: string
  voice: string
  model?: string
  note?: string
}

export type TtsSettings = {
  enabled: boolean
  defaultProvider: TtsProvider
  characterVoices: Record<string, TtsCharacterVoice>
  customVoices: Record<TtsProvider, TtsVoiceProfile[]>
} & Record<TtsProvider, TtsProviderConfig>

export type ImageGenProvider =
  | 'auto'
  | 'openai'
  | 'novel'
  | 'horde'
  | 'pollinations'

export interface ImageGenSettings {
  provider: ImageGenProvider
  model: string
  width: number
  height: number
  steps: number
  scale: number
  sampler: string
  seed: number
  promptPrefix: string
  negativePrompt: string
  autoUrl: string
  autoAuth: string
  openaiSize: string
  openaiBaseUrl: string
  enhance: boolean
}

export interface ImageAsset {
  id: string
  fileName: string
  url: string
  format: string
  contextType?: string
  contextId?: string
  prompt?: string
  negativePrompt?: string
  provider?: string
  model?: string
  width?: number
  height?: number
  seed?: string
  createdAt?: string
}

export interface StreamState {
  active: boolean
  controller: AbortController | null
  partial: {
    content: string
    reasoning?: string
  }
}

export interface ProviderConfig {
  label: string
  secretKey: string
  modelKey: string
  endpointKey?: string
  defaultModel: string
  defaultEndpoint?: string
}

export interface SecretState {
  id: string
  value: string
  label: string
  active: boolean
}

export type SecretStateMap = Record<string, SecretState[] | null>

export interface WorldInfoSummary {
  file_id: string
  name: string
  extensions?: Record<string, unknown>
}

export interface WorldInfoEntry {
  uid?: number
  key?: string[]
  keysecondary?: string[]
  comment?: string
  content?: string
  constant?: boolean
  disable?: boolean
  selective?: boolean
  selectiveLogic?: number
  scanDepth?: number | null
  ignoreBudget?: boolean
  order?: number
  position?: number
  [key: string]: unknown
}

export interface WorldInfoFile {
  name?: string
  entries: Record<string, WorldInfoEntry> | WorldInfoEntry[]
  [key: string]: unknown
}
