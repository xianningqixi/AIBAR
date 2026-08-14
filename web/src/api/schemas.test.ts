import { describe, expect, it } from 'vitest'
import { aibarSettingsSchema, parseWith, sharedModelListSchema } from './schemas'

describe('sharedModelListSchema', () => {
  it('parses a valid response and fills defaults', () => {
    const parsed = parseWith(sharedModelListSchema, {}, '模型列表')
    expect(parsed.models).toEqual([])
    expect(parsed.supportedSources).toEqual([])
  })

  it('keeps unknown model fields instead of stripping them', () => {
    // 后端加新字段时前端不应把它丢掉（looseObject），否则保存回去会造成字段丢失。
    const parsed = parseWith(sharedModelListSchema, {
      models: [{
        id: 'm1', name: 'n', source: 'claude', model: 'claude-sonnet-4-5',
        temperature: 0.7, maxTokens: 4096, topP: 1, presencePenalty: 0, frequencyPenalty: 0,
        futureField: 'kept',
      }],
      supportedSources: ['claude'],
    }, '模型列表')
    expect((parsed.models[0] as Record<string, unknown>).futureField).toBe('kept')
  })

  it('throws a readable Chinese error with the failing path', () => {
    expect(() => parseWith(sharedModelListSchema, { models: [{ id: 1 }] }, '模型列表'))
      .toThrowError(/模型列表返回了意外的数据格式/)
  })
})

describe('aibarSettingsSchema', () => {
  it('accepts plain objects and rejects arrays', () => {
    expect(aibarSettingsSchema.safeParse({ a: 1 }).success).toBe(true)
    expect(aibarSettingsSchema.safeParse([1]).success).toBe(false)
    expect(aibarSettingsSchema.safeParse('x').success).toBe(false)
  })
})
