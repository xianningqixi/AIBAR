// AI 起草（角色卡 / 故事卡共用）的编排逻辑。
// 纯提示词与解析在 lib/aiDraft.ts；这里收敛两个编辑页曾经各自维护的
// 草稿状态机：追问 → 回答 → 起草 → 填入表单。

import { reactive } from 'vue'
import { generateReply } from '@/api/generate'
import { getApiErrorMessage } from '@/api/client'
import type { ModelProfile } from '@/api/types'
import { parseDraftQuestions, type DraftQuestion } from '@/lib/aiDraft'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useUiStore } from '@/stores/ui'

export interface AiDraftConfig<TDraft> {
  /** idea 为空时的提示，如「先写一句你想要的角色方向」 */
  ideaRequiredMessage: string
  /** 起草成功 toast */
  draftReadyMessage: string
  /** 额外前置校验（如故事页要求先选角色）；返回警告文案则中止 */
  guard?: () => string | null
  buildQuestionsPayload: (profile: ModelProfile, idea: string) => Record<string, unknown>
  buildDraftPayload: (profile: ModelProfile, idea: string, guidance: string) => Record<string, unknown>
  parseDraft: (text: string) => TDraft
  applyDraft: (result: TDraft, profile: ModelProfile) => void
}

/** 本地 ollama 占位配置没有真实生成能力，不应成为默认起草模型 */
export function isLocalPlaceholderProfile(profile?: ModelProfile): boolean {
  return Boolean(profile?.source === 'custom' && /(?:127\.0\.0\.1|localhost):11434/i.test(profile.endpoint || ''))
}

export function useAiDraft<TDraft>(config: AiDraftConfig<TDraft>) {
  const models = useModelProfilesStore()
  const ui = useUiStore()

  const draft = reactive({
    profileId: '',
    idea: '',
    questions: [] as DraftQuestion[],
    answers: {} as Record<string, string>,
    asking: false,
    loading: false,
    error: '',
  })

  function getDraftProfile() {
    return models.getProfile(draft.profileId) || models.activeProfile
  }

  function defaultDraftProfileId(): string {
    const active = models.getProfile(models.activeProfileId)
    if (active && !isLocalPlaceholderProfile(active)) return active.id
    const remote = models.profiles.find((profile) => (
      profile.id !== active?.id
      && !isLocalPlaceholderProfile(profile)
      && (profile.apiKeySaved || profile.secretId)
    ))
    return remote?.id || active?.id || models.profiles[0]?.id || ''
  }

  function draftAnswersText(): string {
    return draft.questions
      .map((item, index) => {
        const answer = (draft.answers[item.id] || '').trim()
        return answer ? `Q${index + 1}: ${item.question}\nA${index + 1}: ${answer}` : ''
      })
      .filter(Boolean)
      .join('\n\n')
  }

  function selectDraftOption(question: DraftQuestion, option: string) {
    draft.answers[question.id] = option
  }

  function useCustomDraftAnswer(question: DraftQuestion) {
    draft.answers[question.id] = ''
  }

  function isDraftOptionSelected(question: DraftQuestion, option: string): boolean {
    return (draft.answers[question.id] || '').trim() === option
  }

  function isCustomDraftAnswer(question: DraftQuestion): boolean {
    const answer = (draft.answers[question.id] || '').trim()
    return Boolean(answer) && !question.options.includes(answer)
  }

  /** 返回中止原因；null 表示可以继续 */
  function preflight(): string | null {
    const guarded = config.guard?.()
    if (guarded) return guarded
    if (!draft.idea.trim()) return config.ideaRequiredMessage
    if (!getDraftProfile()) return '未配置可用模型'
    return null
  }

  async function askDraftQuestions() {
    const blocked = preflight()
    if (blocked) {
      ui.addToast(blocked, 'warning')
      return
    }
    const profile = getDraftProfile()!

    draft.asking = true
    draft.error = ''
    try {
      const reply = await generateReply(config.buildQuestionsPayload(profile, draft.idea))
      const questions = parseDraftQuestions(reply)
      if (!questions.length) throw new Error('模型没有返回有效问题')
      const nextAnswers: Record<string, string> = {}
      for (const question of questions) {
        nextAnswers[question.id] = draft.answers[question.id] || ''
      }
      draft.questions = questions
      draft.answers = nextAnswers
      ui.addToast('问题已生成，按你的偏好回答后再生成', 'success')
    } catch (e: unknown) {
      draft.error = getApiErrorMessage(e, '追问生成失败')
      ui.addToast(`追问生成失败：${draft.error}`, 'error')
    } finally {
      draft.asking = false
    }
  }

  async function draftWithAi() {
    const blocked = preflight()
    if (blocked) {
      ui.addToast(blocked, 'warning')
      return
    }
    const profile = getDraftProfile()!

    draft.loading = true
    draft.error = ''
    try {
      const reply = await generateReply(
        config.buildDraftPayload(profile, draft.idea, draftAnswersText()),
      )
      config.applyDraft(config.parseDraft(reply), profile)
      ui.addToast(config.draftReadyMessage, 'success')
    } catch (e: unknown) {
      draft.error = getApiErrorMessage(e, '起草失败')
      ui.addToast(`起草失败：${draft.error}`, 'error')
    } finally {
      draft.loading = false
    }
  }

  return {
    draft,
    getDraftProfile,
    defaultDraftProfileId,
    selectDraftOption,
    useCustomDraftAnswer,
    isDraftOptionSelected,
    isCustomDraftAnswer,
    askDraftQuestions,
    draftWithAi,
  }
}
