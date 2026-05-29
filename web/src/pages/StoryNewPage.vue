<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { useModsStore } from '@/stores/mods'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useImageGenStore } from '@/stores/imageGen'
import { getStory, saveStory } from '@/api/stories'
import { listWorldInfo } from '@/api/worldinfo'
import { generateReply } from '@/api/generate'
import type { Character, ImageAsset, ModelProfile, StoryCard, WorldInfoSummary } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import ModPicker from '@/components/mods/ModPicker.vue'
import ImageGenerateBox from '@/components/image/ImageGenerateBox.vue'
import { buildStoryImagePrompt } from '@/lib/imagePrompts'
import {
  buildStoryDraftPayload,
  buildStoryDraftQuestionsPayload,
  parseDraftQuestions,
  parseStoryDraft,
  type DraftQuestion,
} from '@/lib/aiDraft'

const route = useRoute()
const router = useRouter()
const chars = useCharactersStore()
const ui = useUiStore()
const mods = useModsStore()
const models = useModelProfilesStore()
const imageGen = useImageGenStore()

const isEdit = computed(() => route.name === 'storyEdit')
const editId = computed(() => isEdit.value ? decodeURIComponent((route.params.id as string) || '') : '')
const createMode = computed(() => route.query.mode === 'advanced' ? 'advanced' : 'simple')
const isAdvancedCreate = computed(() => !isEdit.value && createMode.value === 'advanced')
const loadingStory = ref(false)

const characterAvatar = ref<string>((route.query.avatar as string) || '')
const title = ref('')
const summary = ref('')
const scenario = ref('')
const openingUserMessage = ref('')
const useCharGreeting = ref(true)
const customAssistantOpening = ref('')
const tags = ref('')
const world = ref('')
const systemAppend = ref('')
const coverImage = ref('')
const coverAssetId = ref('')
const modelProfileId = ref('')
const modIds = ref<string[]>([])
const worlds = ref<WorldInfoSummary[]>([])
const submitting = ref(false)
const draft = reactive({
  profileId: '',
  idea: '',
  questions: [] as DraftQuestion[],
  answers: {} as Record<string, string>,
  asking: false,
  loading: false,
  error: '',
})

const selectedCharacter = computed<Character | null>(() => {
  return chars.findCharacter(characterAvatar.value) || null
})

const assistantOpening = computed(() => {
  if (!useCharGreeting.value) return customAssistantOpening.value.trim()
  const data = selectedCharacter.value?.data
  return (data?.first_mes || '').trim()
})

const defaultTitle = computed(() => {
  return selectedCharacter.value ? `${selectedCharacter.value.name} 的新故事` : ''
})
const storyImagePrompt = computed(() => buildStoryImagePrompt({
  title: title.value || defaultTitle.value,
  summary: summary.value,
  scenario: scenario.value,
  world: world.value,
}, selectedCharacter.value))
const storyImageContextId = computed(() => editId.value || title.value.trim() || 'new-story')

const pageTitle = computed(() => {
  if (isEdit.value) return '编辑故事卡'
  return isAdvancedCreate.value ? '高级创建故事' : '简易创建故事'
})
const backTo = computed(() => isEdit.value ? `/story/${editId.value}` : '/create?kind=story')

function parseTags(value: string): string[] {
  return value
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function fillFromStory(story: StoryCard) {
  title.value = story.title || ''
  summary.value = story.summary || ''
  scenario.value = story.scenario || ''
  openingUserMessage.value = story.openingUserMessage || ''
  systemAppend.value = story.systemAppend || ''
  coverImage.value = story.coverImage || ''
  coverAssetId.value = story.coverAssetId || ''
  tags.value = (story.tags || []).join(', ')
  world.value = story.world || ''
  modelProfileId.value = story.modelProfileId || ''
  modIds.value = [...(story.modIds || [])]
  characterAvatar.value = story.characterAvatar || ''
  if (story.openingAssistantMessage) {
    const data = selectedCharacter.value?.data
    const charGreeting = (data?.first_mes || '').trim()
    if (charGreeting && story.openingAssistantMessage.trim() === charGreeting) {
      useCharGreeting.value = true
      customAssistantOpening.value = ''
    } else {
      useCharGreeting.value = false
      customAssistantOpening.value = story.openingAssistantMessage
    }
  }
}

function getDraftProfile() {
  return models.getProfile(draft.profileId) || models.activeProfile
}

function isLocalPlaceholderProfile(profile?: ModelProfile): boolean {
  return Boolean(profile?.source === 'custom' && /(?:127\.0\.0\.1|localhost):11434/i.test(profile.endpoint || ''))
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

function currentStoryDraftForm() {
  return {
    title: title.value,
    summary: summary.value,
    scenario: scenario.value,
    openingUserMessage: openingUserMessage.value,
    openingAssistantMessage: assistantOpening.value,
    systemAppend: systemAppend.value,
    tags: tags.value,
  }
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

async function askDraftQuestions() {
  if (!selectedCharacter.value) {
    ui.addToast('请先选择角色', 'warning')
    return
  }
  if (!draft.idea.trim()) {
    ui.addToast('先写一句你想要的故事方向', 'warning')
    return
  }
  const profile = getDraftProfile()
  if (!profile) {
    ui.addToast('未配置可用模型', 'warning')
    return
  }

  draft.asking = true
  draft.error = ''
  try {
    const reply = await generateReply(
      buildStoryDraftQuestionsPayload(
        profile,
        draft.idea,
        selectedCharacter.value,
        currentStoryDraftForm(),
      ),
    )
    const questions = parseDraftQuestions(reply)
    if (!questions.length) throw new Error('模型没有返回有效问题')
    const nextAnswers: Record<string, string> = {}
    for (const question of questions) {
      nextAnswers[question.id] = draft.answers[question.id] || ''
    }
    draft.questions = questions
    draft.answers = nextAnswers
    ui.addToast('问题已生成，按你的偏好回答后再生成', 'success')
  } catch (e: any) {
    draft.error = e?.message || '追问生成失败'
    ui.addToast(`追问生成失败：${draft.error}`, 'error')
  } finally {
    draft.asking = false
  }
}

async function draftWithAi() {
  if (!selectedCharacter.value) {
    ui.addToast('请先选择角色', 'warning')
    return
  }
  if (!draft.idea.trim()) {
    ui.addToast('先写一句你想要的故事方向', 'warning')
    return
  }
  const profile = getDraftProfile()
  if (!profile) {
    ui.addToast('未配置可用模型', 'warning')
    return
  }

  draft.loading = true
  draft.error = ''
  try {
    const reply = await generateReply(
      buildStoryDraftPayload(
        profile,
        draft.idea,
        selectedCharacter.value,
        currentStoryDraftForm(),
        draftAnswersText(),
      ),
    )
    const result = parseStoryDraft(reply)
    if (result.title) title.value = result.title
    if (result.summary) summary.value = result.summary
    if (result.scenario) scenario.value = result.scenario
    if (result.openingUserMessage) openingUserMessage.value = result.openingUserMessage
    if (result.openingAssistantMessage) {
      useCharGreeting.value = false
      customAssistantOpening.value = result.openingAssistantMessage
    }
    if (result.systemAppend) systemAppend.value = result.systemAppend
    if (result.tags.length) tags.value = result.tags.join(', ')
    if (!modelProfileId.value) modelProfileId.value = profile.id
    ui.addToast('AI 故事初稿已填入表单，可以继续手改', 'success')
  } catch (e: any) {
    draft.error = e?.message || '起草失败'
    ui.addToast(`起草失败：${draft.error}`, 'error')
  } finally {
    draft.loading = false
  }
}

async function saveHandler() {
  if (!selectedCharacter.value) {
    ui.addToast('请先选择角色', 'warning')
    return
  }
  const storyTitle = title.value.trim() || defaultTitle.value
  if (!storyTitle) {
    ui.addToast('故事标题不能为空', 'warning')
    return
  }

  submitting.value = true
  try {
    const payload: Partial<StoryCard> = {
      title: storyTitle,
      summary: summary.value.trim(),
      characterAvatar: selectedCharacter.value.avatar,
      tags: parseTags(tags.value),
      world: world.value,
      scenario: scenario.value.trim(),
      openingUserMessage: openingUserMessage.value.trim(),
      openingAssistantMessage: assistantOpening.value,
      systemAppend: systemAppend.value.trim(),
      coverImage: coverImage.value,
      coverAssetId: coverAssetId.value,
      modelProfileId: modelProfileId.value,
      modIds: modIds.value,
    }
    if (isEdit.value) {
      payload.id = editId.value
    }
    const story = await saveStory(payload)
    ui.addToast(isEdit.value ? '故事卡已更新' : '故事卡已保存', 'success')
    router.push(`/story/${encodeURIComponent(story.id)}`)
  } catch (e: any) {
    ui.addToast(`保存失败：${e.message}`, 'error')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    chars.characters.length ? Promise.resolve() : chars.load(),
    mods.load(),
    models.loadSecrets(),
    imageGen.load(),
  ])
  worlds.value = await listWorldInfo().catch(() => [])
  draft.profileId = defaultDraftProfileId()
  if (isEdit.value) {
    loadingStory.value = true
    try {
      const existing = await getStory(editId.value)
      fillFromStory(existing)
    } catch (e: any) {
      ui.addToast(`加载故事失败：${e.message}`, 'error')
      router.push('/browse?tab=stories')
    } finally {
      loadingStory.value = false
    }
  } else if (!characterAvatar.value && chars.characters.length) {
    characterAvatar.value = chars.characters[0].avatar
  }
})

function applyStoryCover(asset: ImageAsset) {
  coverImage.value = asset.url
  coverAssetId.value = asset.id
}
</script>

<template>
  <div class="min-h-screen bg-bg">
    <AppPageHeader :title="pageTitle" :back-to="backTo">
      <template #actions>
        <AppButton variant="gradient" :disabled="submitting" @click="saveHandler">
          {{ submitting ? '保存中…' : isEdit ? '更新故事卡' : '保存故事卡' }}
        </AppButton>
      </template>
    </AppPageHeader>

    <div v-if="loadingStory" class="flex justify-center py-16">
      <AppSpinner size="lg" />
    </div>

    <main v-else class="max-w-4xl mx-auto px-5 py-6 space-y-4 animate-fade-in-up">
      <section class="relative overflow-hidden rounded-2xl ring-1 ring-border-subtle bg-hero-radial">
        <div class="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-accent-500/20 blur-3xl pointer-events-none" />
        <div class="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-brand-500/15 blur-3xl pointer-events-none" />
        <div class="relative p-5 md:p-7 max-w-2xl">
          <p class="text-[11px] uppercase tracking-[0.2em] text-accent-300/80 mb-2">{{ isEdit ? '编辑故事模板' : '故事模板' }}</p>
          <h2 class="text-xl md:text-2xl font-semibold text-ink-primary">
            <template v-if="isEdit">修改 <span class="text-brand-300">{{ title || '故事卡' }}</span> 的设定</template>
            <template v-else>把一段 <span class="text-brand-300">设定</span> 保存成可复用的故事卡</template>
          </h2>
          <p class="mt-1.5 text-xs md:text-sm text-ink-secondary">
            {{ isEdit ? '修改标题、场景、开场消息、默认 MOD，保存后立即生效。' : '标题 / 场景 / 开场消息 / 默认 MOD,都会写入故事卡。下次进入聊天前可以快速基于它开新存档。' }}
          </p>
        </div>
      </section>

      <AppCard v-if="!isEdit" padding="md" tone="glow" class="space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <span class="w-1 h-4 rounded-full bg-brand-gradient" />
              AI 快速起草
            </h3>
            <p class="mt-1 text-xs text-ink-muted">
              基于{{ selectedCharacter ? `「${selectedCharacter.name}」` : '所选角色' }}生成标题、场景、玩家开场和 AI 开场。
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <AppButton
              size="sm"
              variant="secondary"
              :disabled="draft.asking || draft.loading || !selectedCharacter"
              @click="askDraftQuestions"
            >
              {{ draft.asking ? '追问中…' : '让 AI 追问' }}
            </AppButton>
            <AppButton
              size="sm"
              variant="gradient"
              :disabled="draft.asking || draft.loading || !selectedCharacter"
              @click="draftWithAi"
            >
              {{ draft.loading ? '起草中…' : '生成并填入' }}
            </AppButton>
          </div>
        </div>

        <div class="grid md:grid-cols-[1fr_260px] gap-3">
          <AppFormField label="故事想法">
            <AppTextarea
              v-model="draft.idea"
              :rows="3"
              auto-grow
              placeholder="例如：雨夜调查旧剧院失踪案，角色知道舞台背后的真相但不愿直说。"
            />
          </AppFormField>
          <AppFormField label="使用 Profile">
            <AppSelect v-model="draft.profileId">
              <option v-for="p in models.profiles" :key="p.id" :value="p.id">
                {{ p.name }} · {{ p.model }}
              </option>
            </AppSelect>
          </AppFormField>
        </div>

        <div v-if="draft.questions.length" class="space-y-3 rounded-lg bg-surface-sunken p-3 ring-1 ring-border-subtle">
          <h4 class="text-xs font-semibold uppercase tracking-wider text-ink-muted">关键问题</h4>
          <div
            v-for="(question, index) in draft.questions"
            :key="question.id"
            class="space-y-2"
          >
            <div>
              <p class="text-sm font-medium text-ink-secondary">
                {{ index + 1 }}. {{ question.question }}
              </p>
              <p v-if="question.hint" class="mt-1 text-xs text-ink-muted">
                {{ question.hint }}
              </p>
            </div>
            <div v-if="question.options.length" class="flex flex-wrap gap-2">
              <button
                v-for="option in question.options"
                :key="option"
                type="button"
                class="max-w-full whitespace-normal break-words rounded-full px-3 py-1.5 text-left text-xs leading-relaxed ring-1 transition"
                :class="isDraftOptionSelected(question, option)
                  ? 'bg-brand-500/20 text-brand-100 ring-brand-400/70'
                  : 'bg-surface text-ink-secondary ring-border-subtle hover:text-ink-primary hover:ring-brand-400/40'"
                @click="selectDraftOption(question, option)"
              >
                {{ option }}
              </button>
              <button
                type="button"
                class="max-w-full whitespace-normal break-words rounded-full px-3 py-1.5 text-left text-xs leading-relaxed ring-1 transition"
                :class="isCustomDraftAnswer(question)
                  ? 'bg-accent-500/15 text-accent-200 ring-accent-300/60'
                  : 'bg-surface text-ink-secondary ring-border-subtle hover:text-ink-primary hover:ring-accent-300/40'"
                @click="useCustomDraftAnswer(question)"
              >
                其他
              </button>
            </div>
            <AppTextarea
              v-model="draft.answers[question.id]"
              :rows="2"
              auto-grow
              placeholder="也可以自己写：偏好、禁忌、灵感碎片或选项之外的方向。"
            />
          </div>
        </div>

        <div v-if="draft.error" class="text-xs whitespace-pre-wrap bg-red-500/10 text-red-300 ring-1 ring-red-500/20 p-3 rounded-md">
          {{ draft.error }}
        </div>
      </AppCard>

      <AppCard padding="md" class="space-y-4">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          <span class="w-1 h-4 rounded-full bg-brand-gradient" />
          基本信息
        </h3>
        <AppFormField label="选择角色" required>
          <AppSelect v-model="characterAvatar" :disabled="isEdit">
            <option value="" disabled>请选择…</option>
            <option v-for="c in chars.characters" :key="c.avatar" :value="c.avatar">
              {{ c.name }}
            </option>
          </AppSelect>
          <p v-if="isEdit" class="mt-1 text-[11px] text-ink-muted">编辑模式下角色不可更改。</p>
        </AppFormField>

        <div v-if="selectedCharacter" class="flex items-center gap-3 p-3 bg-surface-sunken rounded-lg ring-1 ring-border-subtle">
          <img
            v-if="selectedCharacter.avatar && selectedCharacter.avatar !== 'none'"
            :src="`/thumbnail?type=avatar&file=${encodeURIComponent(selectedCharacter.avatar)}`"
            class="w-12 h-12 rounded-lg object-cover ring-1 ring-border-subtle"
          />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-ink-primary truncate">{{ selectedCharacter.name }}</p>
            <p class="text-xs text-ink-muted truncate">
              {{ selectedCharacter.description || selectedCharacter.data?.description || '无描述' }}
            </p>
          </div>
        </div>

        <AppFormField label="故事标题" required>
          <AppInput v-model="title" :placeholder="defaultTitle" />
        </AppFormField>

        <AppFormField label="简介" hint="展示在故事卡列表,不会直接作为聊天消息。">
          <AppTextarea v-model="summary" :rows="3" auto-grow placeholder="这个故事的看点、目标或背景。" />
        </AppFormField>

        <AppFormField label="标签" hint="逗号或换行分隔。">
          <AppInput v-model="tags" placeholder="悬疑, 学院, 长线" />
        </AppFormField>

        <div class="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
          <div class="aspect-[3/4] overflow-hidden rounded-xl bg-surface-sunken ring-1 ring-border-subtle">
            <img
              v-if="coverImage"
              :src="coverImage"
              class="h-full w-full object-cover"
              alt=""
            />
            <div v-else class="flex h-full items-center justify-center px-4 text-center text-xs text-ink-muted">
              故事封面
            </div>
          </div>
          <ImageGenerateBox
            title="生成故事封面"
            description="使用标题、简介、场景和绑定角色生成封面。生成后会随故事卡保存到本地。"
            :prompt="storyImagePrompt"
            context-type="story"
            :context-id="storyImageContextId"
            action-label="生成并设为封面"
            :draft-profile="getDraftProfile()"
            @generated="applyStoryCover"
          />
        </div>
      </AppCard>

      <AppCard padding="md" class="space-y-4">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          <span class="w-1 h-4 rounded-full bg-brand-gradient" />
          剧本模板
        </h3>
        <AppFormField label="故事场景" hint="开始聊天后会注入 system prompt,不会变成聊天记录。">
          <AppTextarea v-model="scenario" :rows="6" auto-grow placeholder="地点、当前局面、目标、关系、限制条件。" />
        </AppFormField>

        <AppFormField label="玩家开场" hint="可选。开始故事时作为第一条用户消息写入新聊天。">
          <AppTextarea v-model="openingUserMessage" :rows="3" auto-grow placeholder="我推开门,走进雨夜里的酒馆。" />
        </AppFormField>

        <div class="space-y-3">
          <label class="flex items-center gap-2 text-xs text-ink-secondary cursor-pointer">
            <input v-model="useCharGreeting" type="checkbox" class="accent-brand-500" />
            使用角色卡自带开场白作为 AI 开场
          </label>
          <div v-if="useCharGreeting" class="text-xs text-ink-muted whitespace-pre-wrap bg-surface-sunken p-3 rounded-md ring-1 ring-border-subtle max-h-48 overflow-y-auto">
            {{ assistantOpening || '(角色卡没有开场白)' }}
          </div>
          <AppFormField v-else label="AI 开场">
            <AppTextarea
              v-model="customAssistantOpening"
              :rows="5"
              auto-grow
              placeholder="角色或旁白对玩家开场的回应。"
            />
          </AppFormField>
        </div>

        <AppFormField label="额外系统规则" hint="可选。比如叙事节奏、禁忌、玩法规则。">
          <AppTextarea v-model="systemAppend" :rows="4" auto-grow />
        </AppFormField>
      </AppCard>

      <details
        :open="isEdit || isAdvancedCreate"
        class="overflow-hidden rounded-lg bg-surface ring-1 ring-border-subtle"
      >
        <summary class="cursor-pointer list-none px-4 py-3 hover:bg-surface-elevated transition-colors">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <span class="w-1 h-4 rounded-full bg-brand-gradient" />
              高级配置
            </h3>
            <span class="text-xs text-ink-muted">世界书(地点/组织/规则)、模型 Profile、默认 MOD</span>
          </div>
        </summary>
        <div class="space-y-4 border-t border-border-subtle p-4">
          <AppFormField label="世界书" hint="故事发生在固定地点、组织或规则下时再选；只会注入命中关键词的条目。">
            <AppSelect v-model="world">
              <option value="">不绑定</option>
              <option v-for="w in worlds" :key="w.file_id" :value="w.file_id">
                {{ w.name || w.file_id }}
              </option>
            </AppSelect>
          </AppFormField>

          <AppFormField label="模型配置">
            <AppSelect v-model="modelProfileId">
              <option value="">使用默认模型</option>
              <option v-for="profile in models.profiles" :key="profile.id" :value="profile.id">
                {{ profile.name }} · {{ profile.model }}
              </option>
            </AppSelect>
          </AppFormField>

          <ModPicker
            v-model="modIds"
            :mods="mods.mods"
            title="默认加载 MOD"
            description="保存到故事卡模板里。每次开始故事时会默认勾选这些 MOD,也可以临时调整。"
          />
        </div>
      </details>

      <p class="text-xs text-ink-muted">
        {{ isEdit ? '保存后修改立即生效，已从该模板创建的聊天记录不受影响。' : '故事卡是可复用模板。点击开始故事时才会创建新的 ST 聊天记录,同一个故事可以开多条不同存档。' }}
      </p>
    </main>
  </div>
</template>
