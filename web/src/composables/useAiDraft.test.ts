import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAiDraft } from './useAiDraft'

vi.mock('@/api/generate', () => ({
  generateReply: vi.fn(),
}))

import { generateReply } from '@/api/generate'

function setup(overrides: Partial<Parameters<typeof useAiDraft<string>>[0]> = {}) {
  const applied: string[] = []
  const draft = useAiDraft<string>({
    ideaRequiredMessage: '先写想法',
    draftReadyMessage: '已填入',
    buildQuestionsPayload: () => ({ kind: 'questions' }),
    buildDraftPayload: () => ({ kind: 'draft' }),
    parseDraft: (text) => text,
    applyDraft: (result) => applied.push(result),
    ...overrides,
  })
  return { ...draft, applied }
}

describe('useAiDraft', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(generateReply).mockReset()
  })

  it('blocks with a toast when idea is empty', async () => {
    const d = setup()
    await d.askDraftQuestions()
    await d.draftWithAi()
    expect(generateReply).not.toHaveBeenCalled()
    expect(d.applied).toEqual([])
  })

  it('runs guard before other checks', async () => {
    const d = setup({ guard: () => '请先选择角色' })
    d.draft.idea = '武侠故事'
    await d.draftWithAi()
    expect(generateReply).not.toHaveBeenCalled()
  })

  it('parses questions and keeps answers for later rounds', async () => {
    vi.mocked(generateReply).mockResolvedValue(JSON.stringify({
      questions: [
        { id: 'tone', question: '语气？', hint: '', options: ['温柔', '冷酷'] },
      ],
    }))
    const d = setup()
    d.draft.idea = '一个角色'
    await d.askDraftQuestions()
    expect(d.draft.questions).toHaveLength(1)
    d.selectDraftOption(d.draft.questions[0], '温柔')
    expect(d.isDraftOptionSelected(d.draft.questions[0], '温柔')).toBe(true)

    // 第二轮追问保留已有答案
    await d.askDraftQuestions()
    expect(d.draft.answers.tone).toBe('温柔')
  })

  it('generates a draft and applies it with the active profile', async () => {
    vi.mocked(generateReply).mockResolvedValue('草稿内容')
    const d = setup()
    d.draft.idea = '想法'
    await d.draftWithAi()
    expect(d.applied).toEqual(['草稿内容'])
    expect(d.draft.loading).toBe(false)
    expect(d.draft.error).toBe('')
  })

  it('surfaces generation errors on draft.error', async () => {
    vi.mocked(generateReply).mockRejectedValue(new Error('网络错误'))
    const d = setup()
    d.draft.idea = '想法'
    await d.draftWithAi()
    expect(d.applied).toEqual([])
    expect(d.draft.error).toContain('网络错误')
    expect(d.draft.loading).toBe(false)
  })
})
