import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./client', async (importOriginal) => ({
  ...await importOriginal<typeof import('./client')>(),
  apiPost: vi.fn(),
}))

import { apiPost } from './client'
import { generateReply, parseStreamChunk, setGenerationSettledListener } from './generate'
import { parseDraftQuestions } from '@/lib/aiDraft'

afterEach(() => {
  vi.resetAllMocks()
  setGenerationSettledListener(null)
})

describe('generateReply', () => {
  it('兼容空 choices 和思考块在前的响应，合并全部正文后可以解析追问', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      choices: [{ message: { content: '' } }],
      content: [
        { type: 'thinking', thinking: '这不是最终回答', text: '不应混入正文' },
        { type: 'text', text: '{"questions":[' },
        { type: 'tool_use', text: '也不是正文' },
        { type: 'text', text: '{"id":"tone","question":"想要什么风格？","options":["温暖","悬疑"]}]}' },
      ],
    })
    const settled = vi.fn()
    setGenerationSettledListener(settled)
    const reply = await generateReply({ aibar_model_id: 'glm', messages: [] })
    expect(parseDraftQuestions(reply)).toEqual([
      { id: 'tone', question: '想要什么风格？', hint: '', options: ['温暖', '悬疑'] },
    ])
    expect(settled).toHaveBeenCalledOnce()
  })

  it('优先使用已有的 OpenAI 正文，不重复拼接原始 content', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      choices: [{ message: { content: '正常回复' } }],
      content: [{ type: 'text', text: '正常回复' }],
    })
    expect(await generateReply({})).toBe('正常回复')
  })

  it('空数组或空白兼容字段不能遮住后续正文', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      choices: [{ message: { content: [] }, text: '  ' }],
      content: [],
      response: '备用正文',
    })
    expect(await generateReply({})).toBe('备用正文')
  })

  it('保留没有 type 的兼容文本块和原始空格', async () => {
    vi.mocked(apiPost).mockResolvedValue({ content: [{ text: ' 开头' }, { content: '结尾 ' }] })
    expect(await generateReply({})).toBe(' 开头结尾 ')
  })

  it('只有思考内容时明确提示缺少正文，且仍通知结算', async () => {
    vi.mocked(apiPost).mockResolvedValue({ content: [{ type: 'thinking', thinking: '内部分析' }] })
    const settled = vi.fn()
    setGenerationSettledListener(settled)
    await expect(generateReply({})).rejects.toThrow('模型未返回正文，请重试或切换模型')
    expect(settled).toHaveBeenCalledOnce()
  })
})

describe('parseStreamChunk', () => {
  it('preserves OpenAI-compatible deltas', () => {
    expect(parseStreamChunk({
      choices: [{ delta: { content: 'hello' } }],
    })).toEqual({ content: 'hello', reasoning: undefined })
  })

  it('extracts Anthropic text and thinking deltas', () => {
    expect(parseStreamChunk({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: '你好' },
    })).toEqual({ content: '你好', reasoning: undefined })

    expect(parseStreamChunk({
      type: 'content_block_delta',
      delta: { type: 'thinking_delta', thinking: '分析中' },
    })).toEqual({ content: undefined, reasoning: '分析中' })
  })
})
