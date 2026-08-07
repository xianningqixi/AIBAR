import { describe, expect, it } from 'vitest'
import type { ImageGenSettings } from '@/api/types'
import { parseImageGenDraft } from './imageGenDraft'

const fallback: ImageGenSettings = {
  provider: 'novel',
  model: 'nai-diffusion-3',
  width: 768,
  height: 1024,
  steps: 28,
  scale: 7,
  sampler: 'DPM++ 2M Karras',
  seed: -1,
  promptPrefix: 'best quality',
  negativePrompt: 'lowres, blurry',
  autoUrl: '',
  autoAuth: '',
  openaiSize: '1024x1024',
  openaiBaseUrl: '',
  enhance: false,
}

const openaiFallback: ImageGenSettings = { ...fallback, provider: 'openai' }

const validJson = JSON.stringify({
  prompt: 'a detective in a rainy alley',
  negativePrompt: 'bad hands',
  width: 832,
  height: 1216,
  steps: 30,
  scale: 6,
  sampler: 'Euler a',
  openaiSize: '1024x1792',
  promptPrefix: 'masterpiece',
  enhance: true,
  reason: '雨夜街拍路线',
})

describe('parseImageGenDraft', () => {
  it('parses a valid plain JSON draft', () => {
    expect(parseImageGenDraft(validJson, fallback)).toEqual({
      prompt: 'a detective in a rainy alley',
      negativePrompt: 'bad hands',
      width: 832,
      height: 1216,
      steps: 30,
      scale: 6,
      sampler: 'Euler a',
      openaiSize: '1024x1792',
      promptPrefix: 'masterpiece',
      enhance: true,
      reason: '雨夜街拍路线',
    })
  })

  it('parses JSON inside a ```json fence and inside prose', () => {
    expect(parseImageGenDraft('```json\n' + validJson + '\n```', fallback).prompt)
      .toBe('a detective in a rainy alley')
    expect(parseImageGenDraft(`好的，参数如下：\n${validJson}\n祝顺利。`, fallback).steps).toBe(30)
  })

  it('throws the custom error when no JSON object is found', () => {
    expect(() => parseImageGenDraft('抱歉。', fallback)).toThrow('模型没有返回可解析的 JSON')
    expect(() => parseImageGenDraft('{"prompt": "cut off', fallback)).toThrow('模型没有返回可解析的 JSON')
  })

  it('throws the friendly error for malformed JSON between braces', () => {
    expect(() => parseImageGenDraft('{"prompt": unquoted}', fallback)).toThrow('模型没有返回可解析的 JSON')
  })

  it('falls back to the current settings when fields are missing', () => {
    expect(parseImageGenDraft('{}', fallback)).toEqual({
      prompt: '',
      negativePrompt: 'lowres, blurry',
      width: 768,
      height: 1024,
      steps: 28,
      scale: 7,
      sampler: 'DPM++ 2M Karras',
      openaiSize: '1024x1024',
      promptPrefix: '',
      enhance: false,
      reason: '',
    })
  })

  it('clamps out-of-range dimensions into 512-1536 and snaps them to multiples of 64', () => {
    const draft = parseImageGenDraft('{"width": 100, "height": 4000}', fallback)
    expect(draft.width).toBe(512)
    expect(draft.height).toBe(1536)

    expect(parseImageGenDraft('{"width": 700}', fallback).width).toBe(704)
    expect(parseImageGenDraft('{"width": 1000}', fallback).width).toBe(1024)
  })

  it('accepts numeric strings and falls back on non-numeric dimension values', () => {
    expect(parseImageGenDraft('{"width": "704"}', fallback).width).toBe(704)
    expect(parseImageGenDraft('{"width": "很宽"}', fallback).width).toBe(768)
    expect(parseImageGenDraft('{"width": {}}', fallback).width).toBe(768)
  })

  it('clamps and rounds steps and scale', () => {
    const draft = parseImageGenDraft('{"steps": 999, "scale": 0.2}', fallback)
    expect(draft.steps).toBe(80)
    expect(draft.scale).toBe(1)

    const rounded = parseImageGenDraft('{"steps": 27.6, "scale": 6.4}', fallback)
    expect(rounded.steps).toBe(28)
    expect(rounded.scale).toBe(6)

    expect(parseImageGenDraft('{"steps": "abc"}', fallback).steps).toBe(28)
  })

  it('rejects unknown openaiSize values in favor of the fallback', () => {
    expect(parseImageGenDraft('{"openaiSize": "1792x1024"}', fallback).openaiSize).toBe('1792x1024')
    expect(parseImageGenDraft('{"openaiSize": "2048x2048"}', fallback).openaiSize).toBe('1024x1024')
    expect(parseImageGenDraft('{"openaiSize": 1024}', fallback).openaiSize).toBe('1024x1024')
  })

  it('only accepts real booleans for enhance', () => {
    expect(parseImageGenDraft('{"enhance": true}', fallback).enhance).toBe(true)
    expect(parseImageGenDraft('{"enhance": "true"}', fallback).enhance).toBe(false)
    expect(parseImageGenDraft('{"enhance": 1}', fallback).enhance).toBe(false)
  })

  it('ignores unknown keys in the model output', () => {
    const draft = parseImageGenDraft('{"prompt": "portrait", "seed": 42, "loraWeights": [1, 2]}', fallback)
    expect(draft).not.toHaveProperty('seed')
    expect(draft).not.toHaveProperty('loraWeights')
    expect(draft.prompt).toBe('portrait')
  })

  it('leaves the prompt untouched for non-public providers', () => {
    const draft = parseImageGenDraft('{"prompt": "nude woman, seductive pose"}', fallback)
    expect(draft.prompt).toBe('nude woman, seductive pose')
    expect(draft.negativePrompt).toBe('lowres, blurry')
  })

  it('softens the prompt and extends the negative prompt for public providers', () => {
    const draft = parseImageGenDraft(
      '{"prompt": "nude woman, seductive pose", "negativePrompt": "bad hands"}',
      openaiFallback,
    )

    expect(draft.prompt).not.toMatch(/nude|seductive/i)
    expect(draft.prompt).toContain('tastefully framed')
    expect(draft.prompt).toContain('restrained adult allure')
    expect(draft.negativePrompt.startsWith('bad hands, ')).toBe(true)
    expect(draft.negativePrompt).toContain('minor-looking')
    expect(draft.negativePrompt).toContain('underage')
    expect(draft.negativePrompt).toContain('vulgar pose')
  })

  it('applies the safety negative to the fallback negative prompt when the draft omits one', () => {
    const draft = parseImageGenDraft('{}', openaiFallback)
    expect(draft.negativePrompt.startsWith('lowres, blurry, ')).toBe(true)
    expect(draft.negativePrompt).toContain('pornographic content')
  })
})
