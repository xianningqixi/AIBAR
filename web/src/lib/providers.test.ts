import { describe, expect, it } from 'vitest'
import {
  isSharedModelProviderSource,
  providerConfigs,
  sharedModelProviderSources,
} from './providers'

describe('Anthropic provider', () => {
  it('is exposed through the shared native Messages API flow', () => {
    expect(sharedModelProviderSources).toContain('claude')
    expect(isSharedModelProviderSource('claude')).toBe(true)
    expect(providerConfigs.claude).toMatchObject({
      secretKey: 'api_key_claude',
      modelKey: 'claude_model',
      endpointKey: 'reverse_proxy',
      defaultModel: 'claude-sonnet-4-5',
    })
  })
})
