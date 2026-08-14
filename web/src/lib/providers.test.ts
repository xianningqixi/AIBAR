import { describe, expect, it } from 'vitest'
import {
  fallbackSharedModelProviderSources,
  providerConfigs,
} from './providers'

describe('Anthropic provider', () => {
  it('is exposed through the shared native Messages API flow', () => {
    expect(fallbackSharedModelProviderSources).toContain('claude')
    expect(providerConfigs.claude).toMatchObject({
      secretKey: 'api_key_claude',
      modelKey: 'claude_model',
      endpointKey: 'reverse_proxy',
      defaultModel: 'claude-sonnet-4-5',
    })
  })
})

describe('provider metadata', () => {
  it('has a display config for every fallback shared source', () => {
    // 兜底清单里的渠道必须都能渲染（label/密钥映射），否则管理页会退化成裸 source 字符串。
    for (const source of fallbackSharedModelProviderSources) {
      expect(providerConfigs[source], `missing providerConfigs entry for ${source}`).toBeTruthy()
    }
  })

  it('keeps ai21 available to match the backend whitelist', () => {
    expect(fallbackSharedModelProviderSources).toContain('ai21')
    expect(providerConfigs.ai21).toMatchObject({ secretKey: 'api_key_ai21' })
  })
})
