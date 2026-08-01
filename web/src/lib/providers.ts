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
  cometapi: {
    label: 'CometAPI',
    secretKey: 'api_key_cometapi',
    modelKey: 'cometapi_model',
    defaultModel: 'gpt-4o-mini',
  },
  azure_openai: {
    label: 'Azure OpenAI',
    secretKey: 'api_key_azure_openai',
    modelKey: 'azure_openai_model',
    endpointKey: 'reverse_proxy',
    defaultModel: 'gpt-4o-mini',
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
  workers_ai: {
    label: 'Cloudflare Workers AI',
    secretKey: 'api_key_workers_ai',
    modelKey: 'workers_ai_model',
    defaultModel: '@cf/meta/llama-3.1-8b-instruct',
  },
}

// Keep this list aligned with the sources accepted by the shared-model backend.
// Providers outside this list may exist in SillyTavern, but are not safe to
// expose through AIBAR's shared credential flow.
export const sharedModelProviderSources = [
  'custom',
  'openai',
  'openrouter',
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

export function isSharedModelProviderSource(source: string): boolean {
  return (sharedModelProviderSources as readonly string[]).includes(source)
}

export function getProviderLabel(source: string): string {
  return providerConfigs[source]?.label || source
}
