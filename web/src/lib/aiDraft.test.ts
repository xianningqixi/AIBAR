import { describe, expect, it } from 'vitest'
import { parseCharacterDraft, parseDraftQuestions, parseStoryDraft } from './aiDraft'

const fullCharacterJson = JSON.stringify({
  ch_name: '林月',
  description: '雾城侦探',
  personality: '冷静克制',
  scenario: '雨夜档案室',
  first_mes: '你终于来了。',
  mes_example: '<START>示例对话',
  creator_notes: '注意口吻',
  tags: ['悬疑', '都市'],
  system_prompt: '保持角色',
  post_history_instructions: '不要出戏',
  alternate_greetings: ['第二开场'],
})

describe('parseCharacterDraft', () => {
  it('parses a fully populated plain JSON draft', () => {
    expect(parseCharacterDraft(fullCharacterJson)).toEqual({
      ch_name: '林月',
      description: '雾城侦探',
      personality: '冷静克制',
      scenario: '雨夜档案室',
      first_mes: '你终于来了。',
      mes_example: '<START>示例对话',
      creator_notes: '注意口吻',
      tags: ['悬疑', '都市'],
      system_prompt: '保持角色',
      post_history_instructions: '不要出戏',
      alternate_greetings: ['第二开场'],
    })
  })

  it('parses JSON wrapped in a ```json fence', () => {
    const draft = parseCharacterDraft('```json\n' + fullCharacterJson + '\n```')
    expect(draft.ch_name).toBe('林月')
    expect(draft.tags).toEqual(['悬疑', '都市'])
  })

  it('parses JSON wrapped in a bare ``` fence', () => {
    expect(parseCharacterDraft('```\n' + fullCharacterJson + '\n```').ch_name).toBe('林月')
  })

  it('extracts JSON embedded in surrounding prose', () => {
    const draft = parseCharacterDraft(`当然可以！这是角色初稿：\n${fullCharacterJson}\n请查收。`)
    expect(draft.first_mes).toBe('你终于来了。')
  })

  it('throws the custom error when no JSON object exists', () => {
    expect(() => parseCharacterDraft('我做不到。')).toThrow('模型没有返回可解析的 JSON')
    expect(() => parseCharacterDraft('')).toThrow('模型没有返回可解析的 JSON')
    expect(() => parseCharacterDraft('[1, 2, 3]')).toThrow('模型没有返回可解析的 JSON')
  })

  it('throws the custom error when the JSON is cut off before any closing brace', () => {
    expect(() => parseCharacterDraft('{"ch_name": "林月"')).toThrow('模型没有返回可解析的 JSON')
  })

  it('throws the friendly error for malformed JSON between the braces', () => {
    expect(() => parseCharacterDraft('{"ch_name": 林月}')).toThrow('模型没有返回可解析的 JSON')
    expect(() => parseCharacterDraft('{"tags": ["悬疑",}')).toThrow('模型没有返回可解析的 JSON')
  })

  it('returns empty strings and arrays for missing fields', () => {
    expect(parseCharacterDraft('{}')).toEqual({
      ch_name: '',
      description: '',
      personality: '',
      scenario: '',
      first_mes: '',
      mes_example: '',
      creator_notes: '',
      tags: [],
      system_prompt: '',
      post_history_instructions: '',
      alternate_greetings: [],
    })
  })

  it('coerces wrong-typed fields to empty values instead of throwing', () => {
    const draft = parseCharacterDraft(JSON.stringify({
      ch_name: 123,
      description: null,
      personality: { nested: true },
      scenario: false,
      first_mes: ['数组'],
      tags: 42,
      alternate_greetings: { a: 1 },
    }))

    expect(draft.ch_name).toBe('')
    expect(draft.description).toBe('')
    expect(draft.personality).toBe('')
    expect(draft.scenario).toBe('')
    expect(draft.first_mes).toBe('')
    expect(draft.tags).toEqual([])
    expect(draft.alternate_greetings).toEqual([])
  })

  it('splits comma-, pause-, and newline-separated tag strings', () => {
    const draft = parseCharacterDraft(JSON.stringify({
      tags: '悬疑, 都市，恋爱、校园\n奇幻',
      alternate_greetings: '开场一\n开场二',
    }))

    expect(draft.tags).toEqual(['悬疑', '都市', '恋爱', '校园', '奇幻'])
    expect(draft.alternate_greetings).toEqual(['开场一', '开场二'])
  })

  it('filters non-string and blank entries out of array fields', () => {
    const draft = parseCharacterDraft(JSON.stringify({
      tags: [1, '悬疑', null, '  ', ' 都市 ', { x: 1 }],
    }))

    expect(draft.tags).toEqual(['悬疑', '都市'])
  })

  it('trims whitespace on every string field and ignores extra keys', () => {
    const draft = parseCharacterDraft(JSON.stringify({
      ch_name: '  林月  ',
      description: '  雾城侦探  ',
      surprise_field: '应被忽略',
    }))

    expect(draft.ch_name).toBe('林月')
    expect(draft.description).toBe('雾城侦探')
    expect(Object.keys(draft).sort()).toEqual([
      'alternate_greetings',
      'ch_name',
      'creator_notes',
      'description',
      'first_mes',
      'mes_example',
      'personality',
      'post_history_instructions',
      'scenario',
      'system_prompt',
      'tags',
    ])
  })
})

describe('parseStoryDraft', () => {
  it('parses a fully populated story draft', () => {
    expect(parseStoryDraft(JSON.stringify({
      title: '雾城序章',
      summary: '侦探与访客',
      scenario: '雨夜档案室的对峙',
      openingUserMessage: '我推门进来。',
      openingAssistantMessage: '雨还没有停。',
      systemAppend: '保持悬疑节奏',
      tags: ['悬疑'],
    }))).toEqual({
      title: '雾城序章',
      summary: '侦探与访客',
      scenario: '雨夜档案室的对峙',
      openingUserMessage: '我推门进来。',
      openingAssistantMessage: '雨还没有停。',
      systemAppend: '保持悬疑节奏',
      tags: ['悬疑'],
    })
  })

  it('defaults missing and wrong-typed fields to empty values', () => {
    expect(parseStoryDraft('{"title": 7, "tags": "悬疑，都市"}')).toEqual({
      title: '',
      summary: '',
      scenario: '',
      openingUserMessage: '',
      openingAssistantMessage: '',
      systemAppend: '',
      tags: ['悬疑', '都市'],
    })
  })

  it('extracts a fenced story draft from prose', () => {
    const draft = parseStoryDraft('好的：\n```json\n{"title":"雾城"}\n```\n完成。')
    expect(draft.title).toBe('雾城')
  })

  it('throws on unparseable output', () => {
    expect(() => parseStoryDraft('no json here')).toThrow('模型没有返回可解析的 JSON')
    expect(() => parseStoryDraft('{"title": }')).toThrow('模型没有返回可解析的 JSON')
  })
})

describe('parseDraftQuestions', () => {
  it('parses valid questions with ids, hints, and options', () => {
    expect(parseDraftQuestions(JSON.stringify({
      questions: [
        { id: 'tone', question: '角色说话的口吻？', hint: '语气', options: ['冷淡', '热情'] },
      ],
    }))).toEqual([
      { id: 'tone', question: '角色说话的口吻？', hint: '语气', options: ['冷淡', '热情'] },
    ])
  })

  it('normalizes ids to lowercase kebab form and falls back to positional ids', () => {
    const questions = parseDraftQuestions(JSON.stringify({
      questions: [
        { id: 'Tone & Style!', question: '口吻？' },
        { id: '关系张力', question: '关系？' },
        { question: '目标？' },
        { id: 42, question: '数字 id？' },
      ],
    }))

    expect(questions.map((question) => question.id)).toEqual(['tone-style', 'q2', 'q3', 'q4'])
  })

  it('drops entries without question text and caps the list at six', () => {
    const questions = parseDraftQuestions(JSON.stringify({
      questions: [
        { id: 'skip', hint: '没有问题文本' },
        ...Array.from({ length: 8 }, (_, index) => ({ question: `问题 ${index}` })),
      ],
    }))

    expect(questions).toHaveLength(6)
    expect(questions[0].question).toBe('问题 0')
  })

  it('caps options at five and accepts delimiter-separated option strings', () => {
    const questions = parseDraftQuestions(JSON.stringify({
      questions: [
        { question: '多选项', options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
        { question: '字符串选项', options: '冷淡，热情、克制' },
      ],
    }))

    expect(questions[0].options).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(questions[1].options).toEqual(['冷淡', '热情', '克制'])
  })

  it('returns an empty list for missing or non-array questions', () => {
    expect(parseDraftQuestions('{}')).toEqual([])
    expect(parseDraftQuestions('{"questions": "口吻？"}')).toEqual([])
    expect(parseDraftQuestions('{"questions": []}')).toEqual([])
  })

  it('tolerates non-object entries in the questions array', () => {
    expect(parseDraftQuestions('{"questions": ["裸字符串", null, {"question": "留下"}]}')).toEqual([
      { id: 'q3', question: '留下', hint: '', options: [] },
    ])
  })

  it('throws on malformed model output', () => {
    expect(() => parseDraftQuestions('无法回答')).toThrow('模型没有返回可解析的 JSON')
    expect(() => parseDraftQuestions('{"questions": [{]}')).toThrow('模型没有返回可解析的 JSON')
  })
})
