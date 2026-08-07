import { describe, expect, it } from 'vitest'
import type { Character, ChatMessage, ModelProfile } from '@/api/types'
import { buildReplyDraftPayload, parseReplyDraftOptions } from './replyDraft'

const profile: ModelProfile = {
  id: 'profile-1',
  name: '测试模型',
  source: 'openai',
  model: 'gpt-test',
  temperature: 0.7,
  maxTokens: 1000,
  topP: 0.9,
  presencePenalty: 0,
  frequencyPenalty: 0,
}

const character: Character = {
  name: '林月',
  avatar: 'lin-yue.png',
  data: { name: '林月', description: '雾城侦探' },
}

describe('buildReplyDraftPayload', () => {
  it('applies fixed sampling overrides on top of the profile', () => {
    const payload = buildReplyDraftPayload(profile, character, [], { userName: '周舟' })

    expect(payload.temperature).toBe(0.85)
    expect(payload.top_p).toBe(0.95)
    expect(payload.max_tokens).toBe(1800)
    expect(payload.presence_penalty).toBe(0.2)
    expect(payload.frequency_penalty).toBe(0.1)
    expect(payload.model).toBe('gpt-test')
    expect(payload.chat_completion_source).toBe('openai')
    expect(payload.aibar_model_id).toBe('profile-1')
    expect(payload.user_name).toBe('周舟')
    expect(payload.char_name).toBe('林月')
  })

  it('sends exactly one system and one user message with the JSON schema contract', () => {
    const payload = buildReplyDraftPayload(profile, character, [], { userName: '周舟' })
    const messages = payload.messages as Array<{ role: string; content: string }>

    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('JSON schema: {"options":[{"title":"","direction":"","message":""}]}')
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toContain('用户名称：周舟')
  })

  it('numbers the transcript with speaker names and skips blank messages without renumbering', () => {
    const history: ChatMessage[] = [
      { role: 'assistant', content: '你来了。' },
      { role: 'user', content: '   ' },
      { role: 'system', content: '场景切换' },
      { role: 'user', content: '我到了。' },
    ]
    const payload = buildReplyDraftPayload(profile, character, history, { userName: '周舟' })
    const userContent = (payload.messages as Array<{ content: string }>)[1].content

    expect(userContent).toContain('1. 林月：你来了。')
    expect(userContent).toContain('3. 系统：场景切换')
    expect(userContent).toContain('4. 周舟：我到了。')
    expect(userContent).not.toContain('2. ')
  })

  it('keeps only the newest 32 messages in the transcript', () => {
    const history: ChatMessage[] = Array.from({ length: 40 }, (_, index) => ({
      role: 'user' as const,
      content: `msg-${index}`,
    }))
    const payload = buildReplyDraftPayload(profile, character, history, { userName: '周舟' })
    const userContent = (payload.messages as Array<{ content: string }>)[1].content

    expect(userContent).not.toContain('msg-7')
    expect(userContent).toContain('1. 周舟：msg-8')
    expect(userContent).toContain('32. 周舟：msg-39')
  })

  it('falls back to an opening hint when there is no usable transcript', () => {
    const payload = buildReplyDraftPayload(profile, character, [], { userName: '周舟' })
    const userContent = (payload.messages as Array<{ content: string }>)[1].content

    expect(userContent).toContain('暂无对话，请基于角色设定给出开局回复方向。')
  })

  it('includes optional context blocks only when provided', () => {
    const withAll = buildReplyDraftPayload(profile, character, [], {
      userName: '周舟',
      personaDescription: '调查员',
      memorySummary: '记得雨夜',
      worldInfoText: '雾城设定',
      userNote: '想试探她',
    })
    const withNone = buildReplyDraftPayload(profile, character, [], { userName: '周舟' })
    const fullContent = (withAll.messages as Array<{ content: string }>)[1].content
    const bareContent = (withNone.messages as Array<{ content: string }>)[1].content

    expect(fullContent).toContain('用户身份：调查员')
    expect(fullContent).toContain('长期记忆 / 背景信息：\n记得雨夜')
    expect(fullContent).toContain('世界书命中信息：\n雾城设定')
    expect(fullContent).toContain('用户已有想法或想让你参考的方向：\n想试探她')
    expect(bareContent).not.toContain('用户身份')
    expect(bareContent).not.toContain('长期记忆')
    expect(bareContent).not.toContain('世界书命中信息')
    expect(bareContent).not.toContain('用户已有想法')
  })

  it('falls back to character.data fields for the character context', () => {
    const payload = buildReplyDraftPayload(profile, character, [], { userName: '周舟' })
    const userContent = (payload.messages as Array<{ content: string }>)[1].content

    expect(userContent).toContain('"description": "雾城侦探"')
  })
})

describe('parseReplyDraftOptions', () => {
  const validPayload = JSON.stringify({
    options: [
      { title: '安抚', direction: '缓和气氛', message: '别担心，我在。' },
      { title: '试探', direction: '追问秘密', message: '你到底瞒了我什么？' },
    ],
  })

  it('parses a plain JSON response', () => {
    expect(parseReplyDraftOptions(validPayload)).toEqual([
      { id: 'reply-1', title: '安抚', direction: '缓和气氛', message: '别担心，我在。' },
      { id: 'reply-2', title: '试探', direction: '追问秘密', message: '你到底瞒了我什么？' },
    ])
  })

  it('parses JSON wrapped in a ```json fence', () => {
    const options = parseReplyDraftOptions('```json\n' + validPayload + '\n```')
    expect(options).toHaveLength(2)
    expect(options[0].message).toBe('别担心，我在。')
  })

  it('parses JSON wrapped in a bare ``` fence', () => {
    const options = parseReplyDraftOptions('```\n' + validPayload + '\n```')
    expect(options).toHaveLength(2)
  })

  it('extracts JSON embedded in surrounding prose', () => {
    const options = parseReplyDraftOptions(`好的，以下是回复选项：\n${validPayload}\n希望对你有帮助。`)
    expect(options).toHaveLength(2)
    expect(options[1].title).toBe('试探')
  })

  it('throws the custom error when no JSON object is present', () => {
    expect(() => parseReplyDraftOptions('抱歉，我无法回答。')).toThrow('模型没有返回可解析的 JSON')
    expect(() => parseReplyDraftOptions('')).toThrow('模型没有返回可解析的 JSON')
    expect(() => parseReplyDraftOptions('["a","b"]')).toThrow('模型没有返回可解析的 JSON')
  })

  it('throws the custom error when the JSON is truncated before any closing brace', () => {
    expect(() => parseReplyDraftOptions('{"options":[{"title":"安抚"')).toThrow('模型没有返回可解析的 JSON')
  })

  it('falls back to the inner balanced object when the outer JSON is truncated', () => {
    // 外层被截断时取到内层 {"title":...}，它没有 options 字段，得到空列表而不是崩溃
    expect(parseReplyDraftOptions('{"options":[{"title":"安抚","message":"嗨"},')).toEqual([])
  })

  it('returns an empty list when options is missing or not an array', () => {
    expect(parseReplyDraftOptions('{}')).toEqual([])
    expect(parseReplyDraftOptions('{"options": "不是数组"}')).toEqual([])
    expect(parseReplyDraftOptions('{"options": {"0": {"message": "hi"}}}')).toEqual([])
    expect(parseReplyDraftOptions('{"options": []}')).toEqual([])
  })

  it('drops options without a usable message and renumbers ids contiguously', () => {
    const options = parseReplyDraftOptions(JSON.stringify({
      options: [
        { title: '无内容', direction: 'x' },
        { title: '有内容', direction: 'y', message: '走吧。' },
        { title: '空白', message: '   ' },
        { title: '数字', message: 42 },
      ],
    }))

    expect(options).toEqual([
      { id: 'reply-1', title: '有内容', direction: 'y', message: '走吧。' },
    ])
  })

  it('drops non-object entries in the options array', () => {
    const options = parseReplyDraftOptions('{"options": ["纯字符串", null, 3, {"message": "留下"}]}')
    expect(options).toEqual([
      { id: 'reply-1', title: '方向 1', direction: '', message: '留下' },
    ])
  })

  it('fills in default titles and empty directions for missing fields', () => {
    const options = parseReplyDraftOptions('{"options": [{"message": "只有消息"}]}')
    expect(options).toEqual([
      { id: 'reply-1', title: '方向 1', direction: '', message: '只有消息' },
    ])
  })

  it('trims whitespace from every string field', () => {
    const options = parseReplyDraftOptions(JSON.stringify({
      options: [{ title: '  标题  ', direction: '  方向  ', message: '  消息  ' }],
    }))
    expect(options[0]).toEqual({ id: 'reply-1', title: '标题', direction: '方向', message: '消息' })
  })

  it('caps the result at five options', () => {
    const options = parseReplyDraftOptions(JSON.stringify({
      options: Array.from({ length: 8 }, (_, index) => ({ title: `t${index}`, message: `m${index}` })),
    }))

    expect(options).toHaveLength(5)
    expect(options.map((option) => option.id)).toEqual(['reply-1', 'reply-2', 'reply-3', 'reply-4', 'reply-5'])
    expect(options[4].message).toBe('m4')
  })

  it('keeps over-long option text verbatim without truncation', () => {
    const longMessage = '这条消息很长。'.repeat(500)
    const options = parseReplyDraftOptions(JSON.stringify({
      options: [{ title: '长', message: longMessage }],
    }))
    expect(options[0].message).toBe(longMessage)
  })

  it('keeps duplicate options without deduplication', () => {
    const options = parseReplyDraftOptions(JSON.stringify({
      options: [
        { title: '同', direction: '同', message: '同一句话' },
        { title: '同', direction: '同', message: '同一句话' },
      ],
    }))

    expect(options).toHaveLength(2)
    expect(options[0].message).toBe(options[1].message)
    expect(options[0].id).not.toBe(options[1].id)
  })
})
