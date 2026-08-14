<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { useModsStore } from '@/stores/mods'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useImageGenStore } from '@/stores/imageGen'
import { useStoriesStore } from '@/stores/stories'
import { useWorldInfoStore } from '@/stores/worldInfo'
import { getStory, saveStory } from '@/api/stories'
import { getApiErrorMessage } from '@/api/client'
import { confirmDialog } from '@/composables/useDialog'
import { parseTags } from '@/lib/format'
import type { Character, ImageAsset, StoryCard } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppCheckbox from '@/components/ui/AppCheckbox.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import ModPicker from '@/components/mods/ModPicker.vue'
import ImageGenerateBox from '@/components/image/ImageGenerateBox.vue'
import { useSessionStore } from '@/stores/session'
import { buildStoryImagePrompt } from '@/lib/imagePrompts'
import {
  buildStoryDraftPayload,
  buildStoryDraftQuestionsPayload,
  parseStoryDraft,
  type StoryDraft,
} from '@/lib/aiDraft'
import { useAiDraft } from '@/composables/useAiDraft'
import { useAsyncAction } from '@/composables/useAsyncAction'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
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
const coverInput = ref<HTMLInputElement | null>(null)
const modelProfileId = ref('')
const modIds = ref<string[]>([])
const worldInfoStore = useWorldInfoStore()
const storiesStore = useStoriesStore()
const worlds = computed(() => worldInfoStore.worlds)

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

const {
  draft,
  getDraftProfile,
  defaultDraftProfileId,
  selectDraftOption,
  useCustomDraftAnswer,
  isDraftOptionSelected,
  isCustomDraftAnswer,
  askDraftQuestions,
  draftWithAi,
} = useAiDraft<StoryDraft>({
  ideaRequiredMessage: '先写一句你想要的故事方向',
  draftReadyMessage: 'AI 故事初稿已填入表单，可以继续手改',
  guard: () => selectedCharacter.value ? null : '请先选择角色',
  buildQuestionsPayload: (profile, idea) => buildStoryDraftQuestionsPayload(
    profile,
    idea,
    selectedCharacter.value!,
    currentStoryDraftForm(),
  ),
  buildDraftPayload: (profile, idea, guidance) => buildStoryDraftPayload(
    profile,
    idea,
    selectedCharacter.value!,
    currentStoryDraftForm(),
    guidance,
  ),
  parseDraft: parseStoryDraft,
  applyDraft: (result, profile) => {
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
  },
})

// 未保存离开保护：对比可编辑字段与最近一次载入/保存的快照。
function editableSnapshot() {
  return JSON.stringify({
    characterAvatar: characterAvatar.value,
    title: title.value,
    summary: summary.value,
    scenario: scenario.value,
    openingUserMessage: openingUserMessage.value,
    useCharGreeting: useCharGreeting.value,
    customAssistantOpening: customAssistantOpening.value,
    tags: tags.value,
    world: world.value,
    systemAppend: systemAppend.value,
    coverImage: coverImage.value,
    modelProfileId: modelProfileId.value,
    modIds: modIds.value,
  })
}
let savedSnapshot = ''
function markStorySaved() {
  savedSnapshot = editableSnapshot()
}
onBeforeRouteLeave(async () => {
  // 新建页初始快照在 onMounted 里补齐默认角色后建立
  if (!savedSnapshot || editableSnapshot() === savedSnapshot) return true
  return confirmDialog({ title: '离开页面？', message: '有未保存的修改，确定离开吗？AI 生成的草稿也会一并丢失。' })
})

// loading/try/catch/toast 骨架统一交给 useAsyncAction，页面只保留业务分支
const { loading: submitting, run: saveHandler } = useAsyncAction(async () => {
  if (!selectedCharacter.value) {
    ui.addToast('请先选择角色', 'warning')
    return
  }
  const storyTitle = title.value.trim() || defaultTitle.value
  if (!storyTitle) {
    ui.addToast('故事标题不能为空', 'warning')
    return
  }

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
  storiesStore.invalidate()
  markStorySaved()
  ui.addToast(isEdit.value ? '故事卡已更新' : '故事卡已保存', 'success')
  router.push(`/story/${encodeURIComponent(story.id)}`)
}, { errorPrefix: '保存失败' })

onMounted(async () => {
  await Promise.all([
    chars.characters.length ? Promise.resolve() : chars.load(),
    mods.load(),
    models.loadSecrets(),
    imageGen.load(),
  ])
  await worldInfoStore.load().catch(() => undefined)
  draft.profileId = defaultDraftProfileId()
  if (isEdit.value) {
    loadingStory.value = true
    try {
      const existing = await getStory(editId.value)
      fillFromStory(existing)
    } catch (e: unknown) {
      ui.addToast(`加载故事失败：${getApiErrorMessage(e)}`, 'error')
      router.push('/browse?tab=stories')
    } finally {
      loadingStory.value = false
    }
  } else if (!characterAvatar.value && chars.characters.length) {
    characterAvatar.value = chars.characters[0].avatar
  }
  markStorySaved()
})

function applyStoryCover(asset: ImageAsset) {
  coverImage.value = asset.url
  coverAssetId.value = asset.id
}

function openCoverFilePicker() {
  coverInput.value?.click()
}

function onCoverFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ui.addToast('请选择图片文件', 'warning')
    target.value = ''
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    ui.addToast('图片大小不能超过 10MB', 'warning')
    target.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = reader.result as string
    coverImage.value = dataUrl
    coverAssetId.value = ''
  }
  reader.readAsDataURL(file)
  target.value = ''
}

function inheritCharacterCover() {
  if (!selectedCharacter.value?.avatar || selectedCharacter.value.avatar === 'none') {
    ui.addToast('所选角色没有头像', 'warning')
    return
  }
  coverImage.value = `/characters/${encodeURIComponent(selectedCharacter.value.avatar)}`
  coverAssetId.value = ''
}
</script>

<template>
  <div class="min-h-[100dvh] bg-bg">
    <AppPageHeader :title="pageTitle" :back-to="backTo" width="4xl">
      <template #actions>
        <AppButton variant="gradient" :loading="submitting" @click="saveHandler">
          {{ isEdit ? '更新故事卡' : '保存故事卡' }}
        </AppButton>
      </template>
    </AppPageHeader>

    <div v-if="loadingStory" class="flex justify-center py-16">
      <AppSpinner size="lg" />
    </div>

    <main v-else class="max-w-4xl mx-auto px-5 py-6 md:px-8 lg:px-10 space-y-4 animate-fade-in-up">
      <section class="relative overflow-hidden rounded-2xl ring-1 ring-border-subtle bg-hero-radial">
        <div class="absolute -top-12 -right-12 h-56 w-56 rounded-full bg-accent-500/15 blur-2xl pointer-events-none" />
        <div class="absolute -bottom-16 -left-8 h-56 w-56 rounded-full bg-brand-500/10 blur-2xl pointer-events-none" />
        <div class="relative p-5 md:p-7 max-w-2xl">
          <p class="text-[11px] text-accent-300/80 mb-2">{{ isEdit ? '编辑故事模板' : '故事模板' }}</p>
          <h2 class="text-xl md:text-2xl font-semibold text-ink-primary">
            <template v-if="isEdit">修改 <span class="text-brand-300">{{ title || '故事卡' }}</span> 的设定</template>
            <template v-else>把一段 <span class="text-brand-300">设定</span> 保存成可复用的故事卡</template>
          </h2>
          <p class="mt-1.5 text-xs md:text-sm text-ink-secondary">
            {{ isEdit ? '修改标题、场景、开场消息、默认 MOD，保存后立即生效。' : '标题 / 场景 / 开场消息 / 默认 MOD,都会写入故事卡。下次进入聊天前可以快速基于它开新存档。' }}
          </p>
        </div>
      </section>

      <AppCard
        v-if="!isEdit"
        padding="md"
        tone="glow"
        collapsible
        title="AI 快速起草"
        :default-open="true"
      >
        <template #summary>基于所选角色生成标题、场景、玩家开场和 AI 开场</template>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex flex-wrap gap-2">
            <AppButton
              size="sm"
              variant="secondary"
              :loading="draft.asking"
              :disabled="draft.asking || draft.loading || !selectedCharacter"
              @click="askDraftQuestions"
            >
              让 AI 追问
            </AppButton>
            <AppButton
              size="sm"
              variant="gradient"
              :loading="draft.loading"
              :disabled="draft.asking || draft.loading || !selectedCharacter"
              @click="draftWithAi"
            >
              生成并填入
            </AppButton>
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-[1fr_260px]">
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
          <h4 class="text-xs font-semibold text-ink-muted">关键问题</h4>
          <div
            v-for="(question, index) in draft.questions"
            :key="question.id"
            class="space-y-2"
          >
            <div class="border-l-2 border-brand-500/40 bg-surface pl-3 pr-2 py-2 rounded-r-lg">
              <p class="text-sm font-medium text-ink-secondary">
                <span class="text-brand-300">Q{{ index + 1 }}.</span> {{ question.question }}
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

        <div v-if="draft.error" class="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft p-3 text-xs text-danger-strong">
          <svg class="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1-9a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1Z" clip-rule="evenodd" />
          </svg>
          <span class="whitespace-pre-wrap">{{ draft.error }}</span>
        </div>
      </AppCard>

      <AppCard collapsible title="基本信息" :default-open="true">
        <template #summary>选择角色、标题、简介、标签与封面</template>
        <div class="space-y-4">
          <AppFormField label="选择角色" required>
            <AppSelect v-model="characterAvatar" :disabled="isEdit">
              <option value="" disabled>请选择…</option>
              <option v-for="c in chars.characters" :key="c.avatar" :value="c.avatar">
                {{ c.name }}
              </option>
            </AppSelect>
            <p v-if="isEdit" class="mt-1 text-[11px] text-ink-muted">编辑模式下角色不可更改。</p>
          </AppFormField>

          <div v-if="selectedCharacter" class="flex items-center gap-3 rounded-lg bg-surface-sunken p-3 ring-1 ring-border-subtle">
            <img
              v-if="selectedCharacter.avatar && selectedCharacter.avatar !== 'none'"
              :src="`/thumbnail?type=avatar&file=${encodeURIComponent(selectedCharacter.avatar)}`"
              class="h-12 w-12 rounded-lg object-cover ring-1 ring-border-subtle"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-ink-primary">{{ selectedCharacter.name }}</p>
              <p class="truncate text-xs text-ink-muted">
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

          <div class="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
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
            <div class="space-y-3">
              <ImageGenerateBox
                v-if="session.isAdmin"
                title="生成故事封面"
                description="使用标题、简介、场景和绑定角色生成封面。生成后会随故事卡保存到本地。"
                :prompt="storyImagePrompt"
                context-type="story"
                :context-id="storyImageContextId"
                action-label="生成并设为封面"
                :draft-profile="getDraftProfile()"
                @generated="applyStoryCover"
              />
              <div class="rounded-xl border border-border-subtle bg-surface/45 p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="min-w-0">
                    <h4 class="text-sm font-semibold text-ink-primary">本地上传或继承角色封面</h4>
                    <p class="mt-1 text-xs text-ink-muted">支持 PNG、JPG，最大 10MB；也可直接沿用角色头像。</p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <AppButton size="sm" variant="secondary" :disabled="!selectedCharacter" @click="inheritCharacterCover">
                      继承角色头像
                    </AppButton>
                    <AppButton size="sm" variant="secondary" @click="openCoverFilePicker">
                      上传封面
                    </AppButton>
                  </div>
                  <input
                    ref="coverInput"
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="onCoverFileSelected"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppCard>

      <AppCard collapsible title="剧本模板" :default-open="true">
        <template #summary>故事场景，以及可选的开场消息与规则</template>
        <div class="space-y-4">
          <AppFormField label="故事场景" hint="开始聊天后会注入 system prompt,不会变成聊天记录。">
            <AppTextarea v-model="scenario" :rows="6" auto-grow placeholder="地点、当前局面、目标、关系、限制条件。" />
          </AppFormField>

          <AppCard collapsible title="开场消息与规则" :default-open="isEdit || isAdvancedCreate" class="bg-surface-sunken/40 ring-0">
            <template #summary>玩家开场、AI 开场与额外系统规则（可选）</template>
            <div class="space-y-4 pt-1">
              <AppFormField label="玩家开场" hint="可选。开始故事时作为第一条用户消息写入新聊天。">
                <AppTextarea v-model="openingUserMessage" :rows="3" auto-grow placeholder="我推开门,走进雨夜里的酒馆。" />
              </AppFormField>

              <div class="space-y-4">
                <AppCheckbox v-model="useCharGreeting" label="使用角色卡自带开场白作为 AI 开场" />
                <div v-if="useCharGreeting" class="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-sunken p-3 text-xs text-ink-muted ring-1 ring-border-subtle">
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
            </div>
          </AppCard>
        </div>
      </AppCard>

      <AppCard collapsible title="高级配置" :default-open="isEdit || isAdvancedCreate">
        <template #summary>世界书(地点/组织/规则)、模型 Profile、默认 MOD</template>
        <div class="space-y-4">
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
      </AppCard>

      <p class="px-1 text-xs text-ink-muted">
        {{ isEdit ? '保存后修改立即生效，已从该模板创建的聊天记录不受影响。' : '故事卡是可复用模板。点击开始故事时才会创建新的 ST 聊天记录,同一个故事可以开多条不同存档。' }}
      </p>
    </main>
  </div>
</template>
