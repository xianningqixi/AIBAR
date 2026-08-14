import type { ProviderConfig } from '@/api/types'

export const providerConfigs: Record<string, ProviderConfig> = {
  custom: {
    label: 'OpenAI 兼容 / 本地',
    secretKey: 'api_key_custom',
    modelKey: 'custom_model',
    endpointKey: 'custom_url',
    defaultModel: 'llama3.1',
    defaultEndpoint: 'http://127.0.0.1:11434/v1',
  },
  openai: {
    label: 'OpenAI 官方',
    secretKey: 'api_key_openai',
    modelKey: 'openai_model',
    endpointKey: 'reverse_proxy',
    defaultModel: 'gpt-4o-mini',
  },
  claude: {
    label: 'Anthropic Messages API',
    secretKey: 'api_key_claude',
    modelKey: 'claude_model',
    endpointKey: 'reverse_proxy',
    defaultModel: 'claude-sonnet-4-5',
  },
  openrouter: {
    label: 'OpenRouter',
    secretKey: 'api_key_openrouter',
    modelKey: 'openrouter_model',
    defaultModel: 'openai/gpt-4o-mini',
  },
  makersuite: {
    label: 'Gemini / Google AI Studio',
    secretKey: 'api_key_makersuite',
    modelKey: 'google_model',
    endpointKey: 'reverse_proxy',
    defaultModel: 'gemini-2.5-pro',
  },
  deepseek: {
    label: 'DeepSeek',
    secretKey: 'api_key_deepseek',
    modelKey: 'deepseek_model',
    endpointKey: 'reverse_proxy',
    defaultModel: 'deepseek-v4-flash',
  },
  mistralai: {
    label: 'MistralAI',
    secretKey: 'api_key_mistralai',
    modelKey: 'mistralai_model',
    endpointKey: 'reverse_proxy',
    defaultModel: 'mistral-large-latest',
  },
  groq: {
    label: 'Groq',
    secretKey: 'api_key_groq',
    modelKey: 'groq_model',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  xai: {
    label: 'xAI / Grok',
    secretKey: 'api_key_xai',
    modelKey: 'xai_model',
    endpointKey: 'reverse_proxy',
    defaultModel: 'grok-3-beta',
  },
  moonshot: {
    label: 'Moonshot / Kimi',
    secretKey: 'api_key_moonshot',
    modelKey: 'moonshot_model',
    endpointKey: 'reverse_proxy',
    defaultModel: 'kimi-latest',
  },
  siliconflow: {
    label: 'SiliconFlow',
    secretKey: 'api_key_siliconflow',
    modelKey: 'siliconflow_model',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
  },
  cohere: {
    label: 'Cohere',
    secretKey: 'api_key_cohere',
    modelKey: 'cohere_model',
    defaultModel: 'command-r-plus',
  },
  perplexity: {
    label: 'Perplexity',
    secretKey: 'api_key_perplexity',
    modelKey: 'perplexity_model',
    defaultModel: 'sonar-pro',
  },
  chutes: {
    label: 'Chutes',
    secretKey: 'api_key_chutes',
    modelKey: 'chutes_model',
    defaultModel: 'deepseek-ai/DeepSeek-V3-0324',
  },
  electronhub: {
    label: 'ElectronHub',
    secretKey: 'api_key_electronhub',
    modelKey: 'electronhub_model',
    defaultModel: 'gpt-4o-mini',
  },
  nanogpt: {
    label: 'NanoGPT',
    secretKey: 'api_key_nanogpt',
    modelKey: 'nanogpt_model',
    defaultModel: 'gpt-4o-mini',
  },
  aimlapi: {
    label: 'AI/ML API',
    secretKey: 'api_key_aimlapi',
    modelKey: 'aimlapi_model',
    defaultModel: 'chatgpt-4o-latest',
  },
  fireworks: {
    label: 'Fireworks AI',
    secretKey: 'api_key_fireworks',
    modelKey: 'fireworks_model',
    defaultModel: 'accounts/fireworks/models/kimi-k2-instruct',
  },
  ai21: {
    label: 'AI21',
    secretKey: 'api_key_ai21',
    modelKey: 'ai21_model',
    defaultModel: 'jamba-large',
  },
  zai: {
    label: 'Z.AI',
    secretKey: 'api_key_zai',
    modelKey: 'zai_model',
    endpointKey: 'reverse_proxy',
    defaultModel: 'glm-4.6',
  },
  pollinations: {
    label: 'Pollinations',
    secretKey: 'api_key_pollinations',
    modelKey: 'pollinations_model',
    defaultModel: 'openai',
  },
  minimax: {
    label: 'MiniMax',
    secretKey: 'api_key_minimax',
    modelKey: 'minimax_model',
    defaultModel: 'MiniMax-M1',
  },
}

// 后端 /api/aibar/models/list 返回的 supportedSources 才是权威清单；
// 这份静态清单只在列表尚未加载时兜底，避免再出现前后端手工同步漂移。
export const fallbackSharedModelProviderSources = [
  'custom',
  'openai',
  'claude',
  'openrouter',
  'ai21',
  'makersuite',
  'deepseek',
  'mistralai',
  'groq',
  'xai',
  'moonshot',
  'siliconflow',
  'cohere',
  'perplexity',
  'chutes',
  'electronhub',
  'nanogpt',
  'aimlapi',
  'fireworks',
  'zai',
  'pollinations',
  'minimax',
] as const

export function getProviderLabel(source: string): string {
  return providerConfigs[source]?.label || source
}
